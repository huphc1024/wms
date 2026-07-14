"""Warehouse map / simulation aggregate endpoint."""

import math
from datetime import date, timedelta
from collections import defaultdict

from flask import g, jsonify, request
from sqlalchemy import text

from middleware.auth_middleware import require_admin_or_page_permission, require_auth
from middleware.db import with_db
from routes.admin import admin_bp

ZONE_TYPE_COLORS = {
    "RECEIVING": "#F5A623",
    "STORAGE": "#4A90D9",
    "PICKING": "#7ED321",
    "STAGING": "#BD10E0",
    "SHIPPING": "#D0021B",
}

CATEGORY_PALETTE = [
    "#E74C3C", "#3498DB", "#2ECC71", "#9B59B6", "#F39C12",
    "#1ABC9C", "#E67E22", "#34495E", "#16A085", "#C0392B",
    "#8E44AD", "#27AE60", "#2980B9", "#D35400", "#7F8C8D",
]


def _category_color(category: str, index_map: dict) -> str:
    if not category:
        return "#BDC3C7"
    if category not in index_map:
        index_map[category] = len(index_map) % len(CATEGORY_PALETTE)
    return CATEGORY_PALETTE[index_map[category]]


def _parse_int(value) -> int:
    if value is None:
        return 0
    s = str(value).strip()
    if not s or not s.isdigit():
        return 0
    return int(s)


def _derive_bin_position(bin_row, zone_index: int, bin_index_in_zone: int):
    if bin_row.map_x is not None and bin_row.map_y is not None:
        return (
            float(bin_row.map_x),
            float(bin_row.map_y),
            float(bin_row.map_w or 24),
            float(bin_row.map_h or 20),
            True,
        )

    aisle = (bin_row.aisle or "").strip().upper()
    row = _parse_int(bin_row.row_num)
    level = _parse_int(bin_row.level_num)
    zone_x = zone_index * 300 + 30

    if aisle:
        aisle_idx = ord(aisle[0]) - ord("A") if aisle[0].isalpha() else 0
        x = zone_x + 20 + aisle_idx * 90 + max(0, row - 1) * 6
        y = 50 + max(0, level - 1) * 32 + max(0, row - 1) * 4
        return x, y, 26, 22, False

    col = bin_index_in_zone % 3
    row_i = bin_index_in_zone // 3
    x = zone_x + 20 + col * 70
    y = 50 + row_i * 40
    return x, y, 60, 30, False


def _zone_bounds(bins_in_zone):
    if not bins_in_zone:
        return None
    min_x = min(b["map"]["x"] for b in bins_in_zone)
    min_y = min(b["map"]["y"] for b in bins_in_zone)
    max_x = max(b["map"]["x"] + b["map"]["w"] for b in bins_in_zone)
    max_y = max(b["map"]["y"] + b["map"]["h"] for b in bins_in_zone)
    pad = 16
    return {
        "x": min_x - pad,
        "y": min_y - pad,
        "w": (max_x - min_x) + pad * 2,
        "h": (max_y - min_y) + pad * 2,
    }


def _expiry_for_pallet(seed: int) -> str:
    # Stable pseudo-expiry so simulation remains deterministic across refreshes.
    days = 20 + (seed % 220)
    return (date.today() + timedelta(days=days)).isoformat()


def _build_pallets_for_content(bin_id: int, content_rows: list[dict]) -> list[dict]:
    pallets = []
    seq = 1
    for c in content_rows:
        qty_left = int(c["quantity_on_hand"] or 0)
        # Split each SKU into multiple pallets (8-16 units) to visualize pallet-level stock.
        while qty_left > 0:
            chunk = min(qty_left, 8 + ((bin_id + c["item_id"] + seq) % 9))
            seed = (bin_id * 31) + (c["item_id"] * 17) + seq
            pallet_id = f"PLT-{bin_id}-{c['item_id']}-{seq:02d}"
            pallets.append({
                "pallet_id": pallet_id,
                "bin_id": bin_id,
                "item_id": c["item_id"],
                "sku": c["sku"],
                "item_name": c["item_name"],
                "category": c["category"],
                "lot_code": f"LOT-{c['item_id']}-{(seed % 997):03d}",
                "expiry_date": _expiry_for_pallet(seed),
                "quantity_on_hand": chunk,
                "quantity_allocated": min(chunk, int(c["quantity_allocated"] or 0)),
            })
            qty_left -= chunk
            seq += 1
    return pallets


@admin_bp.route("/warehouse-map", methods=["GET"])
@require_auth
@require_admin_or_page_permission("warehouse-simulation")
@with_db
def get_warehouse_map():
    warehouse_id = request.args.get("warehouse_id", type=int)
    if not warehouse_id:
        return jsonify({"error": "warehouse_id is required"}), 400

    wh = g.db.execute(
        text("SELECT warehouse_id, warehouse_code, warehouse_name FROM warehouses WHERE warehouse_id = :wid"),
        {"wid": warehouse_id},
    ).fetchone()
    if not wh:
        return jsonify({"error": "Warehouse not found"}), 404

    zone_rows = g.db.execute(
        text("""
            SELECT zone_id, zone_code, zone_name, zone_type, is_active,
                   color_hex, map_x, map_y, map_w, map_h
            FROM zones
            WHERE warehouse_id = :wid AND is_active = true
            ORDER BY zone_id
        """),
        {"wid": warehouse_id},
    ).fetchall()

    bin_rows = g.db.execute(
        text("""
            SELECT b.bin_id, b.zone_id, z.zone_code, z.zone_name, z.zone_type,
                   b.bin_code, b.bin_barcode, b.bin_type,
                   b.aisle, b.row_num, b.level_num,
                   b.map_x, b.map_y, b.map_w, b.map_h, b.is_active
            FROM bins b
            JOIN zones z ON z.zone_id = b.zone_id
            WHERE b.warehouse_id = :wid AND b.is_active = true
            ORDER BY b.zone_id, b.pick_sequence, b.bin_id
        """),
        {"wid": warehouse_id},
    ).fetchall()

    inv_rows = g.db.execute(
        text("""
            SELECT inv.bin_id, inv.item_id, i.sku, i.item_name, i.category,
                   inv.quantity_on_hand, inv.quantity_allocated
            FROM inventory inv
            JOIN items i ON i.item_id = inv.item_id
            WHERE inv.warehouse_id = :wid AND inv.quantity_on_hand > 0
        """),
        {"wid": warehouse_id},
    ).fetchall()

    inv_by_bin = defaultdict(list)
    category_totals = defaultdict(int)
    for row in inv_rows:
        cat = row.category or "Uncategorized"
        inv_by_bin[row.bin_id].append({
            "item_id": row.item_id,
            "sku": row.sku,
            "item_name": row.item_name,
            "category": cat,
            "quantity_on_hand": int(row.quantity_on_hand or 0),
            "quantity_allocated": int(row.quantity_allocated or 0),
        })
        category_totals[cat] += int(row.quantity_on_hand or 0)

    category_index = {}
    categories = [
        {
            "category": cat,
            "total_qty": qty,
            "color": _category_color(cat, category_index),
        }
        for cat, qty in sorted(category_totals.items(), key=lambda x: (-x[1], x[0]))
    ]

    zone_id_to_index = {z.zone_id: idx for idx, z in enumerate(zone_rows)}
    zone_bin_counter = defaultdict(int)

    bins_out = []
    for b in bin_rows:
        idx = zone_bin_counter[b.zone_id]
        zone_bin_counter[b.zone_id] += 1
        z_idx = zone_id_to_index.get(b.zone_id, 0)
        x, y, w, h, stored = _derive_bin_position(b, z_idx, idx)

        contents = inv_by_bin.get(b.bin_id, [])
        total_qty = sum(c["quantity_on_hand"] for c in contents)
        dominant_category = None
        if contents:
            by_cat = defaultdict(int)
            for c in contents:
                by_cat[c["category"]] += c["quantity_on_hand"]
            dominant_category = max(by_cat.items(), key=lambda kv: kv[1])[0]

        pallets = _build_pallets_for_content(b.bin_id, contents)
        bins_out.append({
            "bin_id": b.bin_id,
            "zone_id": b.zone_id,
            "zone_code": b.zone_code,
            "zone_name": b.zone_name,
            "zone_type": b.zone_type,
            "bin_code": b.bin_code,
            "bin_barcode": b.bin_barcode,
            "bin_type": b.bin_type,
            "aisle": b.aisle,
            "row_num": b.row_num,
            "level_num": b.level_num,
            "map": {"x": x, "y": y, "w": w, "h": h, "stored": stored},
            "total_qty": total_qty,
            "dominant_category": dominant_category,
            "category_color": _category_color(dominant_category or "", category_index),
            "contents": contents,
            "pallets": pallets,
            "pallet_count": len(pallets),
            "status": "empty" if total_qty == 0 else ("full" if total_qty >= 50 else "partial"),
        })

    bins_by_zone = defaultdict(list)
    for b in bins_out:
        bins_by_zone[b["zone_id"]].append(b)

    zones_out = []
    for z in zone_rows:
        z_bins = bins_by_zone.get(z.zone_id, [])
        bounds = _zone_bounds(z_bins)
        if z.map_x is not None and z.map_y is not None:
            bounds = {
                "x": float(z.map_x),
                "y": float(z.map_y),
                "w": float(z.map_w or 280),
                "h": float(z.map_h or 180),
                "stored": True,
            }
        elif bounds:
            bounds["stored"] = False
        zones_out.append({
            "zone_id": z.zone_id,
            "zone_code": z.zone_code,
            "zone_name": z.zone_name,
            "zone_type": z.zone_type,
            "color": z.color_hex or ZONE_TYPE_COLORS.get(z.zone_type, "#95A5A6"),
            "bin_count": len(z_bins),
            "occupied_bins": sum(1 for b in z_bins if b["total_qty"] > 0),
            "bounds": bounds,
        })

    all_x = [b["map"]["x"] for b in bins_out] + [z["bounds"]["x"] for z in zones_out if z.get("bounds")]
    all_y = [b["map"]["y"] for b in bins_out] + [z["bounds"]["y"] for z in zones_out if z.get("bounds")]
    all_x2 = [b["map"]["x"] + b["map"]["w"] for b in bins_out] + [
        z["bounds"]["x"] + z["bounds"]["w"] for z in zones_out if z.get("bounds")
    ]
    all_y2 = [b["map"]["y"] + b["map"]["h"] for b in bins_out] + [
        z["bounds"]["y"] + z["bounds"]["h"] for z in zones_out if z.get("bounds")
    ]

    canvas = {"width": 900, "height": 500}
    if all_x and all_y:
        canvas = {
            "width": max(900, math.ceil(max(all_x2) + 40)),
            "height": max(500, math.ceil(max(all_y2) + 60)),
        }

    return jsonify({
        "warehouse_id": wh.warehouse_id,
        "warehouse_code": wh.warehouse_code,
        "warehouse_name": wh.warehouse_name,
        "canvas": canvas,
        "zones": zones_out,
        "bins": bins_out,
        "categories": categories,
    })
