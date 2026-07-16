"""Mobile / worker warehouse map endpoints (2D rack grid)."""

from urllib.parse import unquote

from flask import Blueprint, g, jsonify, request

from middleware.auth_middleware import require_auth
from middleware.db import with_db
from services.warehouse_map_service import build_rack_detail, build_warehouse_map

warehouse_map_bp = Blueprint("warehouse_map", __name__)


def _allowed_warehouse(warehouse_id: int) -> bool:
    if g.current_user.get("role") == "ADMIN":
        return True
    allowed = set(g.current_user.get("warehouse_ids") or [])
    return warehouse_id in allowed


@warehouse_map_bp.route("", methods=["GET"])
@require_auth
@with_db
def get_map():
    warehouse_id = request.args.get("warehouse_id", type=int)
    if not warehouse_id:
        return jsonify({"error": "warehouse_id is required"}), 400
    if not _allowed_warehouse(warehouse_id):
        return jsonify({"error": "Forbidden"}), 403

    payload = build_warehouse_map(g.db, warehouse_id)
    if not payload:
        return jsonify({"error": "Warehouse not found"}), 404

    zone_id = request.args.get("zone_id", type=int)
    if zone_id:
        payload["racks"] = [r for r in payload["racks"] if r["zone_id"] == zone_id]
        payload["bins"] = [b for b in payload["bins"] if b["zone_id"] == zone_id]
        payload["zones"] = [z for z in payload["zones"] if z["zone_id"] == zone_id]

    return jsonify(payload)


@warehouse_map_bp.route("/rack/<path:rack_key>", methods=["GET"])
@require_auth
@with_db
def get_rack(rack_key):
    warehouse_id = request.args.get("warehouse_id", type=int)
    if not warehouse_id:
        return jsonify({"error": "warehouse_id is required"}), 400
    if not _allowed_warehouse(warehouse_id):
        return jsonify({"error": "Forbidden"}), 403

    rack_key = unquote(rack_key)
    payload = build_warehouse_map(g.db, warehouse_id)
    if not payload:
        return jsonify({"error": "Warehouse not found"}), 404

    detail = build_rack_detail(payload["bins"], rack_key)
    if not detail:
        return jsonify({"error": "Rack not found"}), 404

    highlight_item_id = request.args.get("item_id", type=int)
    highlight_sku = (request.args.get("sku") or "").strip().upper()
    select_mode = (request.args.get("mode") or "view").strip().lower()

    for level in detail["levels"]:
        for slot in level["positions"]:
            bin_data = slot.get("bin")
            selectable = False
            if not bin_data:
                slot["selectable"] = False
                continue

            is_empty = slot["is_empty"]
            has_match = False
            if highlight_item_id or highlight_sku:
                for c in bin_data.get("contents") or []:
                    if highlight_item_id and c.get("item_id") == highlight_item_id:
                        has_match = True
                        break
                    if highlight_sku and (c.get("sku") or "").upper() == highlight_sku:
                        has_match = True
                        break

            if select_mode == "putaway":
                bt = (bin_data.get("bin_type") or "").lower()
                selectable = is_empty and bt not in ("staging", "pickablestaging", "receiving", "shipping")
            elif select_mode == "pick":
                selectable = has_match and not is_empty
            else:
                selectable = True

            slot["selectable"] = selectable
            slot["highlight"] = has_match

    return jsonify({
        "warehouse_id": payload["warehouse_id"],
        "rack": detail,
        "mode": select_mode,
    })
