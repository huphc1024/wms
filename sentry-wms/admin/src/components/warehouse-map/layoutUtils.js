/** Warehouse floor plan helpers — coordinates in meters. */

export const PX_PER_M = 22;

export const DEFAULT_LAYOUT_CONFIG = {
  coordinate_unit: 'LEGACY_CANVAS',
  world_width_m: 50,
  world_height_m: 40,
  warehouse_x_m: 2,
  warehouse_y_m: 2,
  warehouse_w_m: 46,
  warehouse_h_m: 30,
  grid_step_m: 0.25,
  version: 1,
};

export const DEFAULT_ZONE_LAYOUTS = {
  receiving: { label: 'Receiving', x: 0.6, y: 2.0, w: 6.5, h: 18, stroke: '#2563eb' },
  shipping: { label: 'Shipping', x: 42.9, y: 2.0, w: 6.5, h: 18, stroke: '#dc2626' },
  fast: { label: 'Fast', x: 10.2, y: 2.2, w: 13, h: 8.2, stroke: '#16a34a' },
  packing: { label: 'Packing', x: 10.2, y: 27, w: 10.5, h: 4.8, stroke: '#7c3aed' },
  office: { label: 'Office', x: 22.2, y: 27, w: 7.8, h: 4.8, stroke: '#ca8a04' },
  regular: { label: 'Regular', x: 24.2, y: 2.2, w: 10.2, h: 8.2, stroke: '#2563eb' },
  bulk: { label: 'Bulk', x: 10.2, y: 14.6, w: 24.2, h: 10, stroke: '#64748b' },
};

export const PATH_STYLES = {
  FORKLIFT: { stroke: '#2563eb', dash: [], label: 'Luồng xe nâng' },
  PEDESTRIAN: { stroke: '#16a34a', dash: [8, 6], label: 'Lối đi bộ an toàn' },
};

export function mToPx(value) {
  return value * PX_PER_M;
}

export function pxToM(value) {
  return value / PX_PER_M;
}

/** Fit warehouse (+ zones) into a viewport; returns { scale, stagePos }. */
export function fitContentToViewport(draft, viewportW, viewportH, padding = 36) {
  const cfg = draft?.config || DEFAULT_LAYOUT_CONFIG;
  let minX = cfg.warehouse_x_m;
  let minY = cfg.warehouse_y_m;
  let maxX = cfg.warehouse_x_m + cfg.warehouse_w_m;
  let maxY = cfg.warehouse_y_m + cfg.warehouse_h_m;

  (draft?.zones || []).forEach((zone) => {
    minX = Math.min(minX, zone.map_x);
    minY = Math.min(minY, zone.map_y);
    maxX = Math.max(maxX, zone.map_x + zone.map_w);
    maxY = Math.max(maxY, zone.map_y + zone.map_h);
  });
  (draft?.racks || []).forEach((rack) => {
    minX = Math.min(minX, rack.x_m);
    minY = Math.min(minY, rack.y_m);
    maxX = Math.max(maxX, rack.x_m + rack.w_m);
    maxY = Math.max(maxY, rack.y_m + rack.h_m);
  });

  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const availW = Math.max(120, viewportW - padding * 2);
  const availH = Math.max(120, viewportH - padding * 2);
  const scale = Math.min(2.8, Math.max(0.35, Math.min(availW / mToPx(contentW), availH / mToPx(contentH))));
  return {
    scale,
    stagePos: {
      x: padding + (availW - mToPx(contentW) * scale) / 2 - mToPx(minX) * scale,
      y: padding + (availH - mToPx(contentH) * scale) / 2 - mToPx(minY) * scale,
    },
  };
}

export function snap(value, gridStep = 0.25) {
  if (!gridStep || gridStep <= 0) return value;
  return Math.round(value / gridStep) * gridStep;
}

export function snapPoint(point, gridStep) {
  return { x: snap(point.x, gridStep), y: snap(point.y, gridStep) };
}

export function rectsOverlap(a, b, gap = 0.05) {
  return !(
    a.x_m + a.w_m + gap <= b.x_m
    || b.x_m + b.w_m + gap <= a.x_m
    || a.y_m + a.h_m + gap <= b.y_m
    || b.y_m + b.h_m + gap <= a.y_m
  );
}

export function zoneFillColor(pct) {
  if (pct >= 90) return 'rgba(220, 38, 38, 0.48)';
  if (pct >= 70) return 'rgba(245, 158, 11, 0.45)';
  if (pct >= 40) return 'rgba(37, 99, 235, 0.38)';
  if (pct > 0) return 'rgba(22, 163, 74, 0.32)';
  return 'rgba(226, 232, 240, 0.55)';
}

/** Grid geometry for packing N bins inside a zone rectangle (meters). */
export function computeZoneBinGrid(zone, binCount) {
  const pad = 0.22;
  const header = 0.95;
  const gap = 0.025;
  const innerW = Math.max(0.2, zone.map_w - pad * 2);
  const innerH = Math.max(0.2, zone.map_h - pad - header);
  const n = Math.max(1, binCount);
  const aspect = innerW / innerH;
  let cols = Math.max(1, Math.ceil(Math.sqrt(n * aspect)));
  let rows = Math.max(1, Math.ceil(n / cols));
  let cellW = (innerW - gap * Math.max(0, cols - 1)) / cols;
  let cellH = (innerH - gap * Math.max(0, rows - 1)) / rows;
  return {
    pad, header, gap, cols, rows, cellW, cellH, innerW, innerH,
  };
}

/**
 * Pack racks into zone bounds when no saved floor-plan position exists.
 * Prevents stacks of racks sharing the same (index % 4) slot.
 */
export function autoLayoutRacksInZones(draft, { respectSavedLayout = true } = {}) {
  const pad = 0.28;
  const gap = 0.1;
  const headerH = 1.05;

  const byZone = new Map();
  (draft.racks || []).forEach((rack) => {
    if (!byZone.has(rack.zone_id)) byZone.set(rack.zone_id, []);
    byZone.get(rack.zone_id).push(rack);
  });

  (draft.zones || []).forEach((zone) => {
    const zoneRacks = byZone.get(zone.zone_id) || [];
    if (!zoneRacks.length) return;

    const toLayout = respectSavedLayout
      ? zoneRacks.filter((r) => !r.layout_saved)
      : zoneRacks;
    if (!toLayout.length) return;

    toLayout.sort((a, b) => String(a.label || a.rack_key).localeCompare(String(b.label || b.rack_key)));

    const availW = Math.max(0.5, zone.map_w - pad * 2);
    const availH = Math.max(0.5, zone.map_h - pad - headerH);
    const count = toLayout.length;
    const aspect = availW / Math.max(0.1, availH);
    let cols = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
    let rows = Math.max(1, Math.ceil(count / cols));

    let cellW = (availW - gap * Math.max(0, cols - 1)) / cols;
    let cellH = (availH - gap * Math.max(0, rows - 1)) / rows;

    const minW = 0.48;
    const minH = 0.38;
    while ((cellW < minW || cellH < minH) && cols * rows > count && cols > 1) {
      cols = Math.max(1, cols - 1);
      rows = Math.max(1, Math.ceil(count / cols));
      cellW = (availW - gap * Math.max(0, cols - 1)) / cols;
      cellH = (availH - gap * Math.max(0, rows - 1)) / rows;
    }

    toLayout.forEach((rack, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bins = rack.bins || [];
      const maxLevel = Math.max(1, ...bins.map((b) => Number(b.level) || 1));
      const maxPos = Math.max(1, ...bins.map((b) => Number(b.position) || 1));

      rack.x_m = zone.map_x + pad + col * (cellW + gap);
      rack.y_m = zone.map_y + headerH + row * (cellH + gap);
      rack.w_m = Math.min(cellW, Math.max(minW, maxPos * 0.2 + 0.22));
      rack.h_m = Math.min(cellH, Math.max(minH, maxLevel * 0.18 + 0.18));
    });
  });

  return draft;
}

export function binStatus(bin) {
  if (!bin || Number(bin.total_qty || 0) <= 0) return 'empty';
  const hasNearExpiry = (bin.pallets || []).some((p) => {
    if (!p.expiry_date) return false;
    const d = Math.ceil((new Date(p.expiry_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return d <= 30;
  });
  if (hasNearExpiry) return 'expired';
  return 'occupied';
}

export const SLOT_STATUS = {
  empty: { fill: '#F0EDE6', stroke: '#B8AA96', dot: '#B8AA96' },
  occupied: { fill: '#E8F5EA', stroke: '#2D7A3A', dot: '#2D7A3A' },
  expired: { fill: '#FEF3D7', stroke: '#C4722A', dot: '#C4722A' },
};

export function statusColor(status) {
  return SLOT_STATUS[status]?.fill ?? SLOT_STATUS.empty.fill;
}

export function statusStroke(status) {
  return SLOT_STATUS[status]?.stroke ?? SLOT_STATUS.empty.stroke;
}

function zoneKeyFromZone(zone) {
  const code = String(zone.zone_code || zone.zone_name || '').toLowerCase();
  const type = String(zone.zone_type || '').toUpperCase();
  if (type === 'RECEIVING' || code.includes('recv')) return 'receiving';
  if (type === 'SHIPPING' || code.includes('ship')) return 'shipping';
  if (type === 'STAGING' || type === 'PICKING' || code.includes('pack') || code.includes('qc')) return 'packing';
  if (code.includes('office')) return 'office';
  if (code.includes('fast')) return 'fast';
  if (code.includes('regular')) return 'regular';
  if (code.includes('bulk')) return 'bulk';
  return null;
}

export function buildInitialDraft(mapData) {
  const config = {
    ...DEFAULT_LAYOUT_CONFIG,
    ...(mapData?.layout?.config || {}),
  };

  const zones = (mapData?.zones || []).map((zone) => {
    const key = zoneKeyFromZone(zone);
    const fallback = key ? DEFAULT_ZONE_LAYOUTS[key] : null;
    const bounds = zone.bounds || {};
    const zoneBins = (mapData?.bins || []).filter((b) => b.zone_id === zone.zone_id);
    return {
      zone_id: zone.zone_id,
      zone_code: zone.zone_code,
      zone_name: zone.zone_name,
      zone_type: zone.zone_type,
      label: zone.zone_name,
      stroke: zone.color || fallback?.stroke || '#64748b',
      map_x: bounds.stored ? bounds.x : (fallback?.x ?? bounds.x ?? 2),
      map_y: bounds.stored ? bounds.y : (fallback?.y ?? bounds.y ?? 2),
      map_w: bounds.stored ? bounds.w : (fallback?.w ?? bounds.w ?? 8),
      map_h: bounds.stored ? bounds.h : (fallback?.h ?? bounds.h ?? 6),
      fill_pct: zone.fill_pct ?? 0,
      occupied_bins: zone.occupied_bins ?? 0,
      bin_count: zone.bin_count ?? zoneBins.length,
      rack_count: zone.rack_count ?? 0,
      bins: zoneBins,
    };
  });

  const rackLayoutById = new Map(
    (mapData?.layout?.racks || []).filter((r) => r.rack_id).map((r) => [r.rack_id, r]),
  );
  const rackLayoutByKey = new Map(
    (mapData?.layout?.racks || []).map((r) => [r.rack_key, r]),
  );

  const binsByRack = new Map();
  (mapData?.bins || []).forEach((bin) => {
    const key = bin.rack_id ? `id:${bin.rack_id}` : `key:${bin.rack_key || `${bin.zone_id}|${bin.bin_code}`}`;
    if (!binsByRack.has(key)) binsByRack.set(key, []);
    binsByRack.get(key).push(bin);
  });

  const racks = (mapData?.racks || []).map((rack, index) => {
    const saved = rackLayoutById.get(rack.rack_id) || rackLayoutByKey.get(rack.rack_key) || rack.layout;
    const binKey = rack.rack_id ? `id:${rack.rack_id}` : `key:${rack.rack_key}`;
    const bins = binsByRack.get(binKey) || [];
    const zone = zones.find((z) => z.zone_id === rack.zone_id);
    const cols = Math.max(1, bins.length > 4 ? 2 : 1);
    const rows = Math.max(1, Math.ceil(bins.length / cols));
    const defaultW = Math.min(4, Math.max(1.8, cols * 1.2));
    const defaultH = Math.min(6, Math.max(1.4, rows * 1.35));
    const baseX = zone ? zone.map_x + 0.4 + (index % 4) * (defaultW + 0.3) : 10 + (index % 5) * 2.2;
    const baseY = zone ? zone.map_y + 1 + Math.floor(index / 4) * (defaultH + 0.3) : 4 + Math.floor(index / 5) * 2;
    const hasSavedLayout = !!(
      mapData?.layout?.has_saved_layout
      && saved?.x_m != null
      && saved?.y_m != null
    );

    return {
      rack_id: rack.rack_id || saved?.rack_id || null,
      rack_key: rack.rack_key,
      zone_id: rack.zone_id,
      label: rack.rack_label || saved?.label || rack.rack_key,
      x_m: saved?.x_m ?? baseX,
      y_m: saved?.y_m ?? baseY,
      w_m: saved?.w_m ?? defaultW,
      h_m: saved?.h_m ?? defaultH,
      rotation_deg: saved?.rotation_deg ?? 0,
      occupied_slots: rack.occupied_slots ?? 0,
      total_slots: rack.total_slots ?? bins.length,
      layout_saved: hasSavedLayout,
      bins,
    };
  });

  const paths = (mapData?.layout?.paths || []).map((path, index) => ({
    ...path,
    client_id: path.path_id ? `path-${path.path_id}` : `path-new-${index}`,
  }));

  if (!paths.length && !mapData?.layout?.has_saved_layout) {
    const wx = config.warehouse_x_m;
    const wy = config.warehouse_y_m;
    const ww = config.warehouse_w_m;
    const wh = config.warehouse_h_m;
    paths.push(
      {
        client_id: 'path-default-forklift-main',
        path_type: 'FORKLIFT',
        label: 'Luồng xe nâng chính',
        points: [
          { x: wx + 0.5, y: wy + 0.8 },
          { x: wx + ww - 0.5, y: wy + 0.8 },
          { x: wx + ww - 0.5, y: wy + wh / 2 },
          { x: wx + 0.5, y: wy + wh / 2 },
        ],
        width_m: 3,
        one_way: false,
        direction: 'both',
        sort_order: 0,
      },
      {
        client_id: 'path-default-pedestrian',
        path_type: 'PEDESTRIAN',
        label: 'Lối đi bộ an toàn',
        points: [
          { x: wx + 1.2, y: wy + wh - 1.2 },
          { x: wx + ww - 1.2, y: wy + wh - 1.2 },
        ],
        width_m: 1.5,
        one_way: false,
        direction: 'both',
        sort_order: 1,
      },
    );
  }

  const draft = {
    config,
    zones,
    racks,
    paths,
    baseVersion: mapData?.layout?.has_saved_layout ? (config.version || 1) : 0,
  };

  autoLayoutRacksInZones(draft, { respectSavedLayout: true });
  return draft;
}

export function serializeDraftForSave(draft) {
  return {
    base_version: draft.baseVersion ?? draft.config?.version ?? 0,
    layout: {
      coordinate_unit: 'METER',
      world_width_m: draft.config.world_width_m,
      world_height_m: draft.config.world_height_m,
      warehouse_x_m: draft.config.warehouse_x_m,
      warehouse_y_m: draft.config.warehouse_y_m,
      warehouse_w_m: draft.config.warehouse_w_m,
      warehouse_h_m: draft.config.warehouse_h_m,
      grid_step_m: draft.config.grid_step_m,
    },
    zones: draft.zones.map((z) => ({
      zone_id: z.zone_id,
      map_x: z.map_x,
      map_y: z.map_y,
      map_w: z.map_w,
      map_h: z.map_h,
      color_hex: z.stroke,
    })),
    racks: draft.racks.map((r) => ({
      rack_id: r.rack_id || null,
      rack_key: r.rack_key,
      zone_id: r.zone_id,
      label: r.label,
      x_m: r.x_m,
      y_m: r.y_m,
      w_m: r.w_m,
      h_m: r.h_m,
      rotation_deg: r.rotation_deg || 0,
    })),
    paths: draft.paths
      .filter((p) => (p.points || []).length >= 2)
      .map((p, index) => ({
      path_id: p.path_id || null,
      path_type: p.path_type,
      label: p.label,
      points: p.points,
      width_m: p.width_m,
      one_way: p.one_way,
      direction: p.direction || 'both',
      sort_order: p.sort_order ?? index,
    })),
  };
}

export function validateDraftLocally(draft) {
  const errors = [];
  const warnings = [];
  const cfg = draft.config;
  const whRight = cfg.warehouse_x_m + cfg.warehouse_w_m;
  const whBottom = cfg.warehouse_y_m + cfg.warehouse_h_m;

  draft.racks.forEach((rack) => {
    if (rack.x_m + rack.w_m > whRight + 0.01 || rack.y_m + rack.h_m > whBottom + 0.01) {
      errors.push(`Kệ ${rack.label} vượt biên kho`);
    }
  });

  for (let i = 0; i < draft.racks.length; i += 1) {
    for (let j = i + 1; j < draft.racks.length; j += 1) {
      if (rectsOverlap(draft.racks[i], draft.racks[j])) {
        errors.push(`Kệ ${draft.racks[i].label} và ${draft.racks[j].label} chồng nhau`);
      }
    }
  }

  draft.paths.forEach((path) => {
    if (path.path_type === 'FORKLIFT' && path.width_m < 2.5) {
      warnings.push(`Luồng xe nâng "${path.label || 'không tên'}" hẹp hơn 2.5 m`);
    }
    if (path.path_type === 'PEDESTRIAN' && path.width_m < 1.0) {
      warnings.push(`Lối đi bộ "${path.label || 'không tên'}" hẹp hơn 1 m`);
    }
  });

  return { errors, warnings };
}

export function binSlotWithinRack(rack, bin) {
  const bins = rack.bins || [];
  const maxLevel = Math.max(1, ...bins.map((b) => Number(b.level) || 1));
  const maxPos = Math.max(1, ...bins.map((b) => Number(b.position) || 1));
  const level = Number(bin.level) || 1;
  const pos = Number(bin.position) || 1;
  const cellW = rack.w_m / maxPos;
  const cellH = rack.h_m / maxLevel;
  return {
    x: (pos - 1) * cellW + 0.08,
    y: (maxLevel - level) * cellH + 0.08,
    w: Math.max(0.2, cellW - 0.16),
    h: Math.max(0.2, cellH - 0.16),
  };
}

export function cloneDraft(draft) {
  return JSON.parse(JSON.stringify(draft));
}

/** Zone rectangle hit-test in meter coordinates. */
export function findZoneAtPoint(draft, x, y) {
  return (draft?.zones || []).find((z) => (
    x >= z.map_x && x <= z.map_x + z.map_w
    && y >= z.map_y && y <= z.map_y + z.map_h
  )) || null;
}

export function nextRackIdentity(zoneId, racks) {
  const inZone = (racks || []).filter((r) => r.zone_id === zoneId);
  const nums = inZone.map((r) => {
    const parts = String(r.rack_key || '').split('|');
    const bay = parts[parts.length - 1];
    const n = parseInt(bay, 10);
    return Number.isFinite(n) ? n : 0;
  });
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  const aisle = 'R';
  const bayLabel = String(next).padStart(3, '0');
  return {
    rack_key: `${zoneId}|${aisle}|${next}`,
    label: `${aisle}-${bayLabel}`,
    aisle,
    bay: String(next),
  };
}

/** Keep rack rectangle inside zone bounds (meters). */
export function clampRackInZone(rack, zone, gridStep = 0.25) {
  if (!zone) return rack;
  const minW = 0.5;
  const minH = 0.5;
  const w_m = Math.max(minW, Math.min(rack.w_m, zone.map_w - 0.2));
  const h_m = Math.max(minH, Math.min(rack.h_m, zone.map_h - 0.2));
  const x_m = snap(
    Math.max(zone.map_x, Math.min(rack.x_m, zone.map_x + zone.map_w - w_m)),
    gridStep,
  );
  const y_m = snap(
    Math.max(zone.map_y, Math.min(rack.y_m, zone.map_y + zone.map_h - h_m)),
    gridStep,
  );
  return { ...rack, x_m, y_m, w_m, h_m };
}

/** Find a non-overlapping rack slot inside a zone (meters, absolute map coords). */
export function findRackPlacementInZone(zone, racks, {
  w = 1.8,
  h = 1.4,
  gridStep = 0.25,
  preferred = null,
} = {}) {
  const inZone = (racks || []).filter((r) => r.zone_id === zone.zone_id);
  const fits = (x, y) => {
    const candidate = { x_m: x, y_m: y, w_m: w, h_m: h };
    if (x < zone.map_x || y < zone.map_y) return false;
    if (x + w > zone.map_x + zone.map_w + 0.01) return false;
    if (y + h > zone.map_y + zone.map_h + 0.01) return false;
    return !inZone.some((r) => rectsOverlap(candidate, r));
  };

  if (preferred) {
    const x = snap(preferred.x, gridStep);
    const y = snap(preferred.y, gridStep);
    if (fits(x, y)) return { x, y };
  }

  const pad = 0.35;
  const header = 1.05;
  const gap = 0.12;
  const maxCols = Math.max(1, Math.floor((zone.map_w - pad * 2 + gap) / (w + gap)));
  for (let row = 0; row < 30; row += 1) {
    for (let col = 0; col < maxCols; col += 1) {
      const x = snap(zone.map_x + pad + col * (w + gap), gridStep);
      const y = snap(zone.map_y + header + row * (h + gap), gridStep);
      if (fits(x, y)) return { x, y };
    }
  }
  return {
    x: snap(zone.map_x + pad, gridStep),
    y: snap(zone.map_y + header, gridStep),
  };
}

/** @deprecated use findRackPlacementInZone */
export function nextRackPlacementInZone(zone, racks) {
  return findRackPlacementInZone(zone, racks);
}

export function createDraftRack({ zone, x, y, racks, gridStep = 0.25 }) {
  const identity = nextRackIdentity(zone.zone_id, racks);
  const placement = findRackPlacementInZone(zone, racks, {
    gridStep,
    preferred: x != null && y != null ? { x, y } : null,
  });
  return clampRackInZone({
    rack_id: null,
    rack_key: identity.rack_key,
    zone_id: zone.zone_id,
    label: identity.label,
    x_m: placement.x,
    y_m: placement.y,
    w_m: 1.8,
    h_m: 1.4,
    rotation_deg: 0,
    occupied_slots: 0,
    total_slots: 0,
    layout_saved: true,
    bins: [],
  }, zone, gridStep);
}

/** Next empty level/position on a rack for a new bin slot. */
export function nextBinSlot(rack) {
  const bins = rack?.bins || [];
  const maxLevel = Math.max(4, ...bins.map((b) => Number(b.level) || 1));
  for (let level = 1; level <= maxLevel; level += 1) {
    for (let pos = 1; pos <= 2; pos += 1) {
      const taken = bins.some((b) => (
        Number(b.level) === level && Number(b.position) === pos
      ));
      if (!taken) return { level, position: pos };
    }
  }
  return { level: maxLevel + 1, position: 1 };
}

export function buildBinCodeForRack(rack, level, position) {
  const parts = String(rack.rack_key || '').split('|');
  const aisle = parts[1] || 'R';
  const bayNum = parseInt(parts[2], 10);
  const bay = Number.isFinite(bayNum) ? String(bayNum).padStart(3, '0') : (parts[2] || '001');
  return `${aisle}-${bay}-L${level}-P${position}`;
}

export function createDraftZone({ zoneId, zoneCode, zoneName, zoneType, x, y, gridStep = 0.25 }) {
  return {
    zone_id: zoneId,
    zone_code: zoneCode,
    zone_name: zoneName,
    zone_type: zoneType,
    label: zoneName,
    stroke: '#64748b',
    map_x: snap(x, gridStep),
    map_y: snap(y, gridStep),
    map_w: 8,
    map_h: 6,
    fill_pct: 0,
    occupied_bins: 0,
    bin_count: 0,
    rack_count: 0,
    bins: [],
  };
}
