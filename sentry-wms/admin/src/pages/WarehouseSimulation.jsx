import { useState, useEffect, useMemo, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Group, Circle, Arrow } from 'react-konva';
import { api } from '../api.js';
import { useWarehouse } from '../warehouse.jsx';
import { useLocale } from '../i18n/locale.jsx';
import PageHeader from '../components/PageHeader.jsx';

const WORLD_W_M = 50;
const WORLD_H_M = 40;
const PX_PER_M = 22;
const CANVAS_W = WORLD_W_M * PX_PER_M;
const CANVAS_H = WORLD_H_M * PX_PER_M;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.8;
const WAREHOUSE_X_M = 2;
const WAREHOUSE_Y_M = 2;
const WAREHOUSE_W_M = 46;
const WAREHOUSE_H_M = 30;

const ZONES = {
  receiving: { label: 'Receiving', x: 0.6, y: 2.0, w: 6.5, h: 18, stroke: '#2563eb', cols: 2, cellH: 1.45, topPad: 0.85 },
  shipping: { label: 'Shipping', x: 42.9, y: 2.0, w: 6.5, h: 18, stroke: '#dc2626', cols: 2, cellH: 1.45, topPad: 0.85 },
  fast: { label: 'Fast', x: 10.2, y: 2.2, w: 13, h: 8.2, stroke: '#16a34a', cols: 6, cellH: 1.35, topPad: 0.7 },
  regular: { label: 'Regular', x: 24.2, y: 2.2, w: 10.2, h: 8.2, stroke: '#2563eb', cols: 5, cellH: 1.35, topPad: 0.7 },
  bulk: { label: 'Bulk', x: 10.2, y: 14.6, w: 24.2, h: 10, stroke: '#64748b', cols: 10, cellH: 1.4, topPad: 0.7 },
  packing: { label: 'Packing', x: 10.2, y: 27, w: 10.5, h: 4.8, stroke: '#7c3aed', cols: 4, cellH: 1.4, topPad: 0.65 },
  office: { label: 'Office', x: 22.2, y: 27, w: 7.8, h: 4.8, stroke: '#ca8a04', cols: 2, cellH: 1.4, topPad: 0.65 },
};

const ZONE_GAP_M = 0.22;

function zoneFillColor(pct) {
  if (pct >= 90) return 'rgba(220, 38, 38, 0.48)';
  if (pct >= 70) return 'rgba(245, 158, 11, 0.45)';
  if (pct >= 40) return 'rgba(37, 99, 235, 0.38)';
  if (pct > 0) return 'rgba(22, 163, 74, 0.32)';
  return 'rgba(226, 232, 240, 0.55)';
}

function binStatus(bin) {
  if (!bin || Number(bin.total_qty || 0) <= 0) return 'empty';
  const hasNearExpiry = (bin.pallets || []).some((p) => {
    if (!p.expiry_date) return false;
    const d = Math.ceil((new Date(p.expiry_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return d <= 30;
  });
  if (hasNearExpiry) return 'expired';
  return 'occupied';
}

function statusColor(status) {
  if (status === 'empty') return '#dcfce7';
  if (status === 'expired') return '#ddd6fe';
  return '#bfdbfe';
}

/** How many pallet-block slots fit in a zone by area (not by DB bin count). */
function zoneCapacity(zone) {
  const usableH = Math.max(0, zone.h - (zone.topPad || 0.7) - 0.15);
  const rows = Math.max(1, Math.floor(usableH / ((zone.cellH || 1.35) + ZONE_GAP_M)));
  return rows * (zone.cols || 2);
}

function summarizeZone(bins, label, capacity) {
  const cap = Math.max(capacity || bins.length || 0, bins.length);
  const occupied = bins.filter((b) => Number(b.total_qty || 0) > 0).length;
  const fillPct = cap ? Math.round((occupied / cap) * 100) : 0;
  return {
    label,
    capacity: cap,
    bins: bins.length,
    occupied,
    empty: Math.max(0, cap - occupied),
    fillPct,
    emptyPct: Math.max(0, 100 - fillPct),
  };
}

function splitMapBins(bins) {
  const sorted = [...bins].sort((a, b) => String(a.bin_code || '').localeCompare(String(b.bin_code || '')));
  const receiving = [];
  const shipping = [];
  const packing = [];
  const storage = [];
  sorted.forEach((b) => {
    const zt = String(b.zone_type || '').toUpperCase();
    const code = String(b.bin_code || '').toUpperCase();
    if (zt === 'RECEIVING' || code.startsWith('RECV')) receiving.push(b);
    else if (zt === 'SHIPPING' || code.startsWith('SHIP')) shipping.push(b);
    else if (zt === 'STAGING' || zt === 'PICKING' || code.startsWith('QC')) packing.push(b);
    else storage.push(b);
  });

  const byAisle = new Map();
  storage.forEach((b) => {
    const key = String(b.aisle || '').toUpperCase();
    if (!byAisle.has(key)) byAisle.set(key, []);
    byAisle.get(key).push(b);
  });
  const fast = [];
  const regular = [];
  const bulk = [];
  byAisle.forEach((items, key) => {
    if (key === 'A') fast.push(...items);
    else if (key === 'B') regular.push(...items);
    else bulk.push(...items);
  });
  if (!fast.length && !regular.length && !bulk.length && storage.length) {
    return {
      receiving,
      shipping,
      packing,
      fast: storage.slice(0, 10),
      regular: storage.slice(10, 20),
      bulk: storage.slice(20),
      office: [],
    };
  }
  return { receiving, shipping, packing, fast, regular, bulk, office: [] };
}

function slotRect(zone, idx) {
  const cols = zone.cols || 2;
  const cellH = zone.cellH || 1.35;
  const topPad = zone.topPad || 0.7;
  const row = Math.floor(idx / cols);
  const col = idx % cols;
  const cellW = zone.w / cols;
  return {
    x: zone.x + col * cellW + 0.12,
    y: zone.y + topPad + row * (cellH + ZONE_GAP_M),
    w: cellW - 0.24,
    h: cellH,
  };
}

/**
 * Build full-zone slot grid from area capacity.
 * Real bins occupy first slots; remaining slots are virtual empty placeholders
 * so a large zone never looks "100% full" with only 2 blocks.
 */
function buildZoneSlotModel(groups) {
  const slots = [];
  const layouts = [];

  Object.entries(ZONES).forEach(([zoneKey, zone]) => {
    if (zoneKey === 'office') return;
    const bins = groups[zoneKey] || [];
    const capacity = zoneCapacity(zone);
    for (let i = 0; i < capacity; i += 1) {
      const rect = slotRect(zone, i);
      const bin = bins[i] || null;
      if (bin) {
        layouts.push({ bin_id: bin.bin_id, zoneKey, ...rect });
        slots.push({
          id: `bin-${bin.bin_id}`,
          zoneKey,
          kind: 'bin',
          bin,
          ...rect,
        });
      } else {
        slots.push({
          id: `virt-${zoneKey}-${i}`,
          zoneKey,
          kind: 'virtual',
          label: `${zone.label.slice(0, 3).toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
          ...rect,
        });
      }
    }
  });

  return { slots, layouts };
}

function printSlip(type, pallet, bin) {
  const title = type === 'inbound' ? 'Phieu nhap pallet' : 'Phieu xuat pallet';
  const w = window.open('', '_blank', 'width=760,height=640');
  if (!w) return;
  const html = `<html><head><title>${title}</title></head><body style="font-family:Arial,sans-serif;padding:20px"><h2>${title}</h2>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="border:1px solid #ccc;padding:6px">Pallet ID</td><td style="border:1px solid #ccc;padding:6px">${pallet.pallet_id}</td></tr>
      <tr><td style="border:1px solid #ccc;padding:6px">SKU</td><td style="border:1px solid #ccc;padding:6px">${pallet.sku}</td></tr>
      <tr><td style="border:1px solid #ccc;padding:6px">Lot</td><td style="border:1px solid #ccc;padding:6px">${pallet.lot_code || '-'}</td></tr>
      <tr><td style="border:1px solid #ccc;padding:6px">Ton</td><td style="border:1px solid #ccc;padding:6px">${pallet.quantity_on_hand}</td></tr>
      <tr><td style="border:1px solid #ccc;padding:6px">Bin</td><td style="border:1px solid #ccc;padding:6px">${bin?.bin_code || '-'}</td></tr>
    </table></body></html>`;
  w.document.open(); w.document.write(html); w.document.close(); w.focus(); w.print();
}

export default function WarehouseSimulation() {
  const { warehouseId } = useWarehouse();
  const { t } = useLocale();
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedBin, setSelectedBin] = useState(null);
  const [selectedPallet, setSelectedPallet] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [search, setSearch] = useState('');
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [layoutOverrides, setLayoutOverrides] = useState({});

  const loadMap = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    setError('');
    const res = await api.get(`/admin/warehouse-map?warehouse_id=${warehouseId}`);
    setLoading(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setError(data?.error || t('sim.loadError'));
      return;
    }
    const data = await res.json();
    setMapData(data);
    setSelectedBin(null);
    setSelectedPallet(null);
    setSelectedZone(null);
    setScale(1);
    setStagePos({ x: 0, y: 0 });
    setLayoutOverrides({});
  }, [warehouseId, t]);

  useEffect(() => { loadMap(); }, [loadMap]);

  const visibleBins = useMemo(() => mapData?.bins || [], [mapData]);
  const groupedBins = useMemo(() => splitMapBins(visibleBins), [visibleBins]);
  const slotModel = useMemo(() => buildZoneSlotModel(groupedBins), [groupedBins]);
  const binPosById = useMemo(() => {
    const map = new Map();
    slotModel.layouts.forEach((b) => {
      map.set(b.bin_id, layoutOverrides[b.bin_id] || b);
    });
    return map;
  }, [slotModel, layoutOverrides]);

  const binsWithPosition = useMemo(
    () => visibleBins.map((b) => ({ ...b, pos: binPosById.get(b.bin_id) })).filter((b) => b.pos),
    [visibleBins, binPosById],
  );

  const virtualSlots = useMemo(
    () => slotModel.slots.filter((s) => s.kind === 'virtual'),
    [slotModel],
  );

  const selected = useMemo(
    () => mapData?.bins?.find((b) => b.bin_id === selectedBin) || null,
    [mapData, selectedBin],
  );
  const selectedPalletData = useMemo(() => {
    if (!selected) return null;
    return (selected.pallets || []).find((p) => p.pallet_id === selectedPallet) || null;
  }, [selected, selectedPallet]);

  const zoneSummary = useMemo(() => ({
    receiving: summarizeZone(groupedBins.receiving || [], 'Receiving', zoneCapacity(ZONES.receiving)),
    shipping: summarizeZone(groupedBins.shipping || [], 'Shipping', zoneCapacity(ZONES.shipping)),
    fast: summarizeZone(groupedBins.fast || [], 'Fast', zoneCapacity(ZONES.fast)),
    regular: summarizeZone(groupedBins.regular || [], 'Regular', zoneCapacity(ZONES.regular)),
    bulk: summarizeZone(groupedBins.bulk || [], 'Bulk', zoneCapacity(ZONES.bulk)),
    packing: summarizeZone(groupedBins.packing || [], 'Packing', zoneCapacity(ZONES.packing)),
    office: summarizeZone(groupedBins.office || [], 'Office', zoneCapacity(ZONES.office)),
  }), [groupedBins]);

  const totalSlots = useMemo(
    () => Object.values(zoneSummary).reduce((sum, z) => sum + (z.capacity || 0), 0),
    [zoneSummary],
  );
  const occupiedSlots = visibleBins.filter((b) => Number(b.total_qty || 0) > 0).length;
  const emptySlots = Math.max(0, totalSlots - occupiedSlots);
  const nearExpirySlots = visibleBins.filter((b) => binStatus(b) === 'expired').length;
  const occupancyPercent = totalSlots ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, s * 1.2));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, s / 1.2));
  const resetView = () => { setScale(1); setStagePos({ x: 0, y: 0 }); };

  const handleWheel = (e) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const oldScale = scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };
    const newScale = e.evt.deltaY > 0 ? Math.max(MIN_SCALE, oldScale / 1.1) : Math.min(MAX_SCALE, oldScale * 1.1);
    setScale(newScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const renderPalletActions = () => {
    if (!selectedPalletData || !selected) return null;
    return (
      <div className="warehouse-sim-pallet-actions">
        <h3 className="warehouse-sim-detail-subtitle">{t('sim.selectedPallet', 'Pallet dang chon')}</h3>
        <p style={{ fontSize: 12, marginBottom: 8 }}>
          <strong>{selectedPalletData.pallet_id}</strong> - {selectedPalletData.sku} - LOT {selectedPalletData.lot_code}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => printSlip('inbound', selectedPalletData, selected)}>
            {t('sim.printInbound', 'In phieu nhap')}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => printSlip('outbound', selectedPalletData, selected)}>
            {t('sim.printOutbound', 'In phieu xuat')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader title={t('sim.title')}>
        <input
          className="form-input"
          style={{ width: 360 }}
          placeholder="Tìm SKU / LOT / Pallet / vị trí"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-sm" onClick={zoomOut}>-</button>
          <button type="button" className="btn btn-sm" onClick={zoomIn}>+</button>
          <button type="button" className="btn btn-sm" onClick={resetView}>Reset view</button>
          <button type="button" className="btn btn-sm" onClick={loadMap} disabled={loading}>
            {loading ? t('sim.loading') : t('sim.refresh')}
          </button>
        </div>
      </PageHeader>

      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
      {!warehouseId && <p style={{ color: 'var(--text-secondary)' }}>{t('sim.selectWarehouse')}</p>}

      {mapData && (
        <div className="sim2-main">
          <aside className="sim2-sidebar">
            <h3>Bộ lọc kho</h3>
            <div className="sim2-legend-item"><span className="sim2-dot empty" /> Trống</div>
            <div className="sim2-legend-item"><span className="sim2-dot occupied" /> Đang có hàng</div>
            <div className="sim2-legend-item"><span className="sim2-dot expired" /> Sắp hết hạn</div>
            <div className="sim2-legend-item"><span className="sim2-line blue" /> Luồng xe nâng</div>
            <div className="sim2-legend-item"><span className="sim2-line green" /> Lối đi bộ an toàn</div>
            <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
              % theo sức chứa diện tích khu (ô trống ảo lấp đầy layout). Phần dưới = đã dùng, phần trên = còn trống.
            </p>
            <div style={{ marginTop: 10 }}>
              {Object.entries(zoneSummary).map(([key, z]) => (
                <div key={key} className="sim2-legend-item" style={{ justifyContent: 'space-between' }}>
                  <span>{z.label}</span>
                  <strong>{z.fillPct}% · {z.occupied}/{z.capacity}</strong>
                </div>
              ))}
            </div>
          </aside>

          <section className="sim2-map-wrap">
            <div className="sim2-map-toolbar">
              <h2>Bản đồ kho 2D (50m x 40m)</h2>
              <div className="sim2-toolbar-actions">
                <button className="btn btn-sm btn-primary" type="button" onClick={() => setSearch('SKU-MILK-1L')}>Highlight SKU-MILK-1L</button>
                <button className="btn btn-sm" type="button" onClick={() => setSearch('SKU-RICE-5KG')}>Highlight SKU-RICE-5KG</button>
                <button className="btn btn-sm" type="button" onClick={() => setSearch('')}>Reset</button>
              </div>
            </div>

            <div className="sim-konva-canvas">
              <Stage
                width={CANVAS_W}
                height={CANVAS_H}
                draggable
                scaleX={scale}
                scaleY={scale}
                x={stagePos.x}
                y={stagePos.y}
                onDragEnd={(e) => setStagePos({ x: e.target.x(), y: e.target.y() })}
                onWheel={handleWheel}
              >
                <Layer>
                  <Rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill="#e5e7eb" cornerRadius={16} />
                  <Rect
                    x={WAREHOUSE_X_M * PX_PER_M}
                    y={WAREHOUSE_Y_M * PX_PER_M}
                    width={WAREHOUSE_W_M * PX_PER_M}
                    height={WAREHOUSE_H_M * PX_PER_M}
                    fill="#fafafa"
                    stroke="#475569"
                    strokeWidth={2}
                    cornerRadius={10}
                  />
                  <Text
                    x={WAREHOUSE_X_M * PX_PER_M + WAREHOUSE_W_M * PX_PER_M - 210}
                    y={WAREHOUSE_Y_M * PX_PER_M + 8}
                    text={`Toan kho: ${occupancyPercent}%`}
                    fontSize={14}
                    fontStyle="bold"
                    fill="#1e40af"
                  />

                  {Object.entries(ZONES).map(([key, z]) => {
                    const summary = zoneSummary[key] || { fillPct: 0, emptyPct: 100, bins: 0 };
                    const fillH = (z.h * summary.fillPct) / 100;
                    const emptyH = z.h - fillH;
                    return (
                      <Group key={key}>
                        <Rect
                          x={z.x * PX_PER_M}
                          y={z.y * PX_PER_M}
                          width={z.w * PX_PER_M}
                          height={z.h * PX_PER_M}
                          fill="#ffffff"
                          stroke={selectedZone === key ? '#111827' : z.stroke}
                          strokeWidth={selectedZone === key ? 3 : 2}
                          dash={[6, 4]}
                          cornerRadius={8}
                          onClick={() => { setSelectedZone(key); setSelectedBin(null); setSelectedPallet(null); }}
                        />
                        {/* Empty remaining (top) */}
                        <Rect
                          x={z.x * PX_PER_M + 2}
                          y={z.y * PX_PER_M + 2}
                          width={z.w * PX_PER_M - 4}
                          height={Math.max(0, emptyH * PX_PER_M - 2)}
                          fill="rgba(226, 232, 240, 0.75)"
                          cornerRadius={6}
                          listening={false}
                        />
                        {/* Occupied fill (bottom) */}
                        <Rect
                          x={z.x * PX_PER_M + 2}
                          y={(z.y + emptyH) * PX_PER_M}
                          width={z.w * PX_PER_M - 4}
                          height={Math.max(0, fillH * PX_PER_M - 2)}
                          fill={zoneFillColor(summary.fillPct)}
                          cornerRadius={6}
                          listening={false}
                        />
                        <Text
                          x={z.x * PX_PER_M + 6}
                          y={z.y * PX_PER_M + 4}
                          text={`${z.label} ${summary.fillPct}%`}
                          fontSize={12}
                          fontStyle="bold"
                          fill="#0f172a"
                          listening={false}
                        />
                        <Text
                          x={z.x * PX_PER_M + 6}
                          y={z.y * PX_PER_M + 18}
                          text={`Con ${summary.emptyPct}% (${summary.occupied}/${summary.capacity || 0})`}
                          fontSize={10}
                          fill="#334155"
                          listening={false}
                        />
                      </Group>
                    );
                  })}

                  <Arrow points={[WAREHOUSE_X_M * PX_PER_M + 20, WAREHOUSE_Y_M * PX_PER_M + 16, (WAREHOUSE_X_M + WAREHOUSE_W_M) * PX_PER_M - 18, WAREHOUSE_Y_M * PX_PER_M + 16]} stroke="#2563eb" fill="#2563eb" pointerLength={8} pointerWidth={8} />
                  <Arrow points={[(WAREHOUSE_X_M + WAREHOUSE_W_M) * PX_PER_M - 18, WAREHOUSE_Y_M * PX_PER_M + 16, (WAREHOUSE_X_M + WAREHOUSE_W_M) * PX_PER_M - 18, (WAREHOUSE_Y_M + WAREHOUSE_H_M - 0.3) * PX_PER_M]} stroke="#dc2626" fill="#dc2626" pointerLength={8} pointerWidth={8} />
                  <Arrow points={[WAREHOUSE_X_M * PX_PER_M + 18, (WAREHOUSE_Y_M + WAREHOUSE_H_M / 2) * PX_PER_M, (WAREHOUSE_X_M + WAREHOUSE_W_M) * PX_PER_M - 18, (WAREHOUSE_Y_M + WAREHOUSE_H_M / 2) * PX_PER_M]} stroke="#2563eb" fill="#2563eb" pointerLength={8} pointerWidth={8} />

                  {virtualSlots.map((slot) => (
                    <Group key={slot.id} x={slot.x * PX_PER_M} y={slot.y * PX_PER_M} listening={false}>
                      <Rect
                        width={slot.w * PX_PER_M}
                        height={slot.h * PX_PER_M}
                        fill="rgba(248, 250, 252, 0.92)"
                        stroke="#94a3b8"
                        strokeWidth={1}
                        dash={[4, 3]}
                        cornerRadius={4}
                      />
                      <Text text={slot.label} x={4} y={4} fontSize={9} fill="#64748b" />
                      <Text text="trống" x={4} y={18} fontSize={8} fill="#94a3b8" />
                    </Group>
                  ))}

                  {binsWithPosition.map((bin) => {
                    const status = binStatus(bin);
                    const isSelected = selectedBin === bin.bin_id;
                    const searchable = [bin.bin_code, ...(bin.contents || []).map((c) => c.sku), ...(bin.pallets || []).map((p) => `${p.lot_code} ${p.pallet_id}`)].join(' ').toLowerCase();
                    const muted = search && !searchable.includes(search.toLowerCase());
                    return (
                      <Group
                        key={bin.bin_id}
                        x={bin.pos.x * PX_PER_M}
                        y={bin.pos.y * PX_PER_M}
                        draggable
                        onDragEnd={(e) => {
                          const nx = e.target.x() / PX_PER_M;
                          const ny = e.target.y() / PX_PER_M;
                          setLayoutOverrides((prev) => ({ ...prev, [bin.bin_id]: { ...bin.pos, x: nx, y: ny } }));
                        }}
                        onClick={() => { setSelectedBin(bin.bin_id); setSelectedZone(null); setSelectedPallet(null); }}
                        opacity={muted ? 0.3 : 1}
                      >
                        <Rect
                          width={bin.pos.w * PX_PER_M}
                          height={bin.pos.h * PX_PER_M}
                          fill={statusColor(status)}
                          stroke={isSelected ? '#111827' : '#64748b'}
                          strokeWidth={isSelected ? 2.2 : 1}
                          cornerRadius={4}
                        />
                        <Text text={bin.bin_code} x={4} y={2} fontSize={10} fontStyle="bold" />
                        {(bin.pallets || []).slice(0, 4).map((p, idx) => {
                          const col = idx % 2;
                          const row = Math.floor(idx / 2);
                          const px = 6 + col * ((bin.pos.w * PX_PER_M - 20) / 2);
                          const py = 18 + row * 11;
                          return (
                            <Group key={p.pallet_id} x={px} y={py} onClick={(e) => { e.cancelBubble = true; setSelectedBin(bin.bin_id); setSelectedPallet(p.pallet_id); }}>
                              <Circle radius={4} fill={p.expiry_date && (new Date(p.expiry_date) - new Date()) / (24 * 3600 * 1000) <= 30 ? '#dc2626' : '#2563eb'} />
                              <Text text={p.pallet_id.slice(-2)} x={6} y={-5} fontSize={8} />
                            </Group>
                          );
                        })}
                      </Group>
                    );
                  })}
                </Layer>
              </Stage>
            </div>
          </section>

          <aside className="sim2-detail">
            <h3>Thông tin chi tiết</h3>
            <div className="sim2-metric-grid">
              <div className="sim2-metric"><span>Sức chứa</span><strong>{totalSlots}</strong></div>
              <div className="sim2-metric"><span>Đang dùng</span><strong>{occupancyPercent}%</strong></div>
              <div className="sim2-metric"><span>Vị trí trống</span><strong>{emptySlots}</strong></div>
              <div className="sim2-metric"><span>Sắp hết hạn</span><strong>{nearExpirySlots}</strong></div>
            </div>

            <div className="sim2-detail-card">
              {selected ? (
                <>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>{selected.bin_code}</div>
                  <div className="sim2-detail-row"><span>SKU</span><strong>{selected.contents?.[0]?.sku || '-'}</strong></div>
                  <div className="sim2-detail-row"><span>Lot</span><strong>{selected.pallets?.[0]?.lot_code || '-'}</strong></div>
                  <div className="sim2-detail-row"><span>Pallet</span><strong>{selected.pallet_count || 0}</strong></div>
                  <div className="sim2-detail-row"><span>Tồn</span><strong>{selected.total_qty}</strong></div>
                  <div className="sim2-detail-row"><span>Zone</span><strong>{selected.zone_name}</strong></div>
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(selected.pallets || []).map((p) => (
                      <button key={p.pallet_id} type="button" className={`btn btn-sm ${selectedPallet === p.pallet_id ? 'btn-primary' : ''}`} onClick={() => setSelectedPallet(p.pallet_id)}>
                        {p.pallet_id}
                      </button>
                    ))}
                  </div>
                </>
              ) : selectedZone ? (
                <>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>{zoneSummary[selectedZone]?.label}</div>
                  <div className="sim2-detail-row"><span>Sức chứa khu</span><strong>{zoneSummary[selectedZone]?.capacity ?? 0}</strong></div>
                  <div className="sim2-detail-row"><span>Bin thực tế</span><strong>{zoneSummary[selectedZone]?.bins ?? 0}</strong></div>
                  <div className="sim2-detail-row"><span>Đang có hàng</span><strong>{zoneSummary[selectedZone]?.occupied ?? 0}</strong></div>
                  <div className="sim2-detail-row"><span>Lấp đầy</span><strong>{zoneSummary[selectedZone]?.fillPct ?? 0}%</strong></div>
                  <div className="sim2-detail-row"><span>Còn trống</span><strong>{zoneSummary[selectedZone]?.emptyPct ?? 100}% ({zoneSummary[selectedZone]?.empty ?? 0})</strong></div>
                </>
              ) : (
                <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Click vào khu / pallet để xem chi tiết.</div>
              )}
            </div>

            {selected && (selected.pallets || []).length > 0 && (
              <div className="warehouse-sim-pallet-table-wrap">
                <h3 className="warehouse-sim-detail-subtitle">{t('sim.palletList', 'Danh sach pallet')}</h3>
                <table className="warehouse-sim-pallet-table">
                  <thead>
                    <tr><th>ID</th><th>SKU</th><th>LOT</th><th>HSD</th><th>Tồn</th></tr>
                  </thead>
                  <tbody>
                    {selected.pallets.map((p) => (
                      <tr key={p.pallet_id} className={p.pallet_id === selectedPallet ? 'is-selected' : ''} onClick={() => setSelectedPallet(p.pallet_id)}>
                        <td>{p.pallet_id}</td><td>{p.sku}</td><td>{p.lot_code}</td><td>{p.expiry_date}</td><td>{p.quantity_on_hand}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {renderPalletActions()}
          </aside>
        </div>
      )}
    </div>
  );
}
