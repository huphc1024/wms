import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text, Group, Circle, Line, Arrow, Transformer } from 'react-konva';
import {
  PATH_STYLES,
  PX_PER_M,
  binSlotWithinRack,
  binStatus,
  mToPx,
  pxToM,
  snap,
  snapPoint,
  statusColor,
  statusStroke,
  zoneFillColor,
  computeZoneBinGrid,
} from './layoutUtils.js';
import { pathToKonvaPoints } from './canvasHelpers.js';

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.8;
const RACK_DETAIL_MIN_SCALE = 0.72;

function rackOccupancyFill(occupied, total) {
  if (!total) return 'rgba(255,255,255,0.92)';
  const pct = occupied / total;
  if (pct >= 0.9) return 'rgba(254, 226, 226, 0.85)';
  if (pct >= 0.5) return 'rgba(254, 243, 199, 0.82)';
  if (pct > 0) return 'rgba(220, 252, 231, 0.82)';
  return 'rgba(255,255,255,0.88)';
}

function ZoneBinHeatmap({ zone, mutedBinIds, onBinClick, editMode, scale = 1, relative = false }) {
  const bins = zone.bins || [];
  if (!bins.length) return null;

  const grid = computeZoneBinGrid(zone, bins.length);
  const originX = relative ? grid.pad : zone.map_x + grid.pad;
  const originY = relative ? grid.header : zone.map_y + grid.header;
  const baseOpacity = scale >= RACK_DETAIL_MIN_SCALE ? 0.4 : 0.95;

  return (
    <Group listening={!editMode}>
      {bins.map((bin, i) => {
        const col = i % grid.cols;
        const row = Math.floor(i / grid.cols);
        const x = originX + col * (grid.cellW + grid.gap);
        const y = originY + row * (grid.cellH + grid.gap);
        const status = binStatus(bin);
        const muted = mutedBinIds?.has(bin.bin_id);
        return (
          <Rect
            key={bin.bin_id}
            x={mToPx(x)}
            y={mToPx(y)}
            width={Math.max(1, mToPx(grid.cellW))}
            height={Math.max(1, mToPx(grid.cellH))}
            fill={statusColor(status)}
            stroke={statusStroke(status)}
            strokeWidth={0.5}
            cornerRadius={1}
            opacity={muted ? 0.15 : baseOpacity}
            onClick={(e) => {
              e.cancelBubble = true;
              if (!editMode) onBinClick?.(bin.bin_id);
            }}
          />
        );
      })}
    </Group>
  );
}

function PathShape({
  path, editMode, selected, onSelect, onDragPoint, onSelectPoint,
}) {
  const style = PATH_STYLES[path.path_type] || PATH_STYLES.FORKLIFT;
  const flatPoints = pathToKonvaPoints(path.points);
  const strokeWidth = Math.max(2, path.width_m * PX_PER_M * 0.35);

  return (
    <Group onClick={() => onSelect?.(path.client_id)}>
      <Line
        points={flatPoints}
        stroke={style.stroke}
        strokeWidth={strokeWidth}
        dash={style.dash}
        lineCap="round"
        lineJoin="round"
        opacity={selected ? 1 : 0.85}
        hitStrokeWidth={Math.max(16, strokeWidth)}
      />
      {path.points.length >= 2 && path.direction !== 'reverse' && (
        <Arrow
          points={flatPoints.slice(-4)}
          stroke={style.stroke}
          fill={style.stroke}
          pointerLength={8}
          pointerWidth={8}
          opacity={0.9}
        />
      )}
      {path.points.length >= 2 && path.direction !== 'forward' && (
        <Arrow
          points={[
            flatPoints[2], flatPoints[3],
            flatPoints[0], flatPoints[1],
          ]}
          stroke={style.stroke}
          fill={style.stroke}
          pointerLength={8}
          pointerWidth={8}
          opacity={0.9}
        />
      )}
      {editMode && path.points.map((pt, index) => (
        <Circle
          key={`${path.client_id}-${index}`}
          x={mToPx(pt.x)}
          y={mToPx(pt.y)}
          radius={6}
          fill="#fff"
          stroke={style.stroke}
          strokeWidth={2}
          draggable
          onClick={(e) => {
            e.cancelBubble = true;
            onSelect?.(path.client_id);
            onSelectPoint?.(index);
          }}
          onDragMove={(e) => {
            const nx = pxToM(e.target.x());
            const ny = pxToM(e.target.y());
            onDragPoint?.(path.client_id, index, { x: nx, y: ny });
          }}
        />
      ))}
      {path.label && path.points[0] && (
        <Text
          x={mToPx(path.points[0].x) + 4}
          y={mToPx(path.points[0].y) - 14}
          text={path.label}
          fontSize={10}
          fill={style.stroke}
        />
      )}
    </Group>
  );
}

export default function WarehouseMapCanvas({
  draft,
  editMode,
  activeTool,
  scale,
  stagePos,
  selectedZoneId,
  selectedRackKey,
  selectedPathId,
  highlightRackKey,
  highlightRackId,
  searchQuery,
  onStagePosChange,
  onScaleChange,
  onZoneSelect,
  onRackSelect,
  onPathSelect,
  onZoneDragEnd,
  onZoneResize,
  onRackDragEnd,
  onRackResize,
  onPathPointDrag,
  onPathPointSelect,
  onCanvasClick,
  onBinClick,
  onViewportChange,
}) {
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const transformerRef = useRef(null);
  const zoneRef = useRef(null);
  const rackRef = useRef(null);
  const [viewport, setViewport] = useState({ w: 900, h: 560 });
  const cfg = draft.config;
  const worldW = mToPx(cfg.world_width_m);
  const worldH = mToPx(cfg.world_height_m);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const applySize = (width, height) => {
      const next = {
        w: Math.max(320, Math.floor(width)),
        h: Math.max(360, Math.floor(height)),
      };
      setViewport((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    };
    applySize(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      applySize(cr.width, cr.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    onViewportChange?.(viewport);
  }, [viewport, onViewportChange]);

  const mutedBinIds = useMemo(() => {
    const query = String(searchQuery || '').trim().toLowerCase();
    if (!query) return null;
    const muted = new Set();
    draft.racks.forEach((rack) => {
      (rack.bins || []).forEach((bin) => {
        const searchable = [
          bin.bin_code,
          ...(bin.contents || []).flatMap((c) => [c.sku, c.item_name, c.lot_number]),
          ...(bin.pallets || []).filter((p) => !p.is_synthetic).flatMap((p) => [
            p.sku, p.item_name, p.lot_code, p.pallet_id, p.pallet_code,
          ]),
        ].join(' ').toLowerCase();
        if (!searchable.includes(query)) muted.add(bin.bin_id);
      });
    });
    return muted;
  }, [draft.racks, searchQuery]);

  const meterPointFromEvent = useCallback((e) => {
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return null;
    return {
      x: pxToM((pointer.x - stagePos.x) / scale),
      y: pxToM((pointer.y - stagePos.y) / scale),
    };
  }, [scale, stagePos]);

  const handleMapPointer = useCallback((e, onSelect) => {
    if (editMode && (activeTool === 'add-rack' || activeTool === 'add-zone')) {
      e.cancelBubble = true;
      const pt = meterPointFromEvent(e);
      if (pt) onCanvasClick?.(pt);
      return;
    }
    if (editMode && activeTool !== 'select') return;
    onSelect?.();
  }, [activeTool, editMode, meterPointFromEvent, onCanvasClick]);

  const stageDraggable = !editMode || activeTool === 'pan';
  const transformEnabled = editMode && activeTool === 'select';

  useEffect(() => {
    const attach = () => {
      const tr = transformerRef.current;
      if (!tr) return;
      if (!transformEnabled) {
        tr.nodes([]);
        tr.getLayer()?.batchDraw();
        return;
      }
      const node = selectedRackKey ? rackRef.current : (selectedZoneId ? zoneRef.current : null);
      if (node) {
        node.moveToTop();
        tr.nodes([node]);
        tr.moveToTop();
      } else {
        tr.nodes([]);
      }
      tr.getLayer()?.batchDraw();
    };
    const id = requestAnimationFrame(attach);
    return () => cancelAnimationFrame(id);
  }, [transformEnabled, selectedZoneId, selectedRackKey, draft]);

  const handleZoneTransformEnd = useCallback((zone) => (e) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const nx = snap(pxToM(node.x()), cfg.grid_step_m);
    const ny = snap(pxToM(node.y()), cfg.grid_step_m);
    const nw = Math.max(1, snap(zone.map_w * Math.abs(scaleX), cfg.grid_step_m));
    const nh = Math.max(1, snap(zone.map_h * Math.abs(scaleY), cfg.grid_step_m));
    node.position({ x: mToPx(nx), y: mToPx(ny) });
    onZoneDragEnd?.(zone.zone_id, nx, ny);
    onZoneResize?.(zone.zone_id, nw, nh);
  }, [cfg.grid_step_m, onZoneDragEnd, onZoneResize]);

  const handleRackTransformEnd = useCallback((rack) => (e) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const nx = snap(pxToM(node.x()), cfg.grid_step_m);
    const ny = snap(pxToM(node.y()), cfg.grid_step_m);
    const nw = Math.max(0.5, snap(rack.w_m * Math.abs(scaleX), cfg.grid_step_m));
    const nh = Math.max(0.5, snap(rack.h_m * Math.abs(scaleY), cfg.grid_step_m));
    node.position({ x: mToPx(nx), y: mToPx(ny) });
    onRackDragEnd?.(rack.rack_key, nx, ny);
    onRackResize?.(rack.rack_key, nw, nh);
  }, [cfg.grid_step_m, onRackDragEnd, onRackResize]);

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
    const newScale = e.evt.deltaY > 0
      ? Math.max(MIN_SCALE, oldScale / 1.1)
      : Math.min(MAX_SCALE, oldScale * 1.1);
    onScaleChange(newScale);
    onStagePosChange({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const handleStageClick = (e) => {
    if (!editMode || activeTool === 'select' || activeTool === 'pan') return;
    if (activeTool === 'add-rack' || activeTool === 'add-zone') {
      const pt = meterPointFromEvent(e);
      if (pt) onCanvasClick?.(pt);
      return;
    }
    const stage = e.target.getStage();
    if (e.target !== stage) return;
    const pt = meterPointFromEvent(e);
    if (pt) onCanvasClick?.(pt);
  };

  const occupancyStats = useMemo(() => {
    let total = 0;
    let occupied = 0;
    draft.zones.forEach((z) => {
      total += z.bin_count || (z.bins || []).length || 0;
      occupied += z.occupied_bins ?? 0;
    });
    if (!total) {
      total = draft.racks.reduce((sum, r) => sum + (r.total_slots || 0), 0);
      occupied = draft.racks.reduce((sum, r) => sum + (r.occupied_slots || 0), 0);
    }
    return {
      total,
      occupied,
      pct: total ? Math.round((occupied / total) * 100) : 0,
    };
  }, [draft.zones, draft.racks]);

  return (
    <div className="sim-konva-canvas" ref={containerRef}>
      <Stage
        ref={stageRef}
        width={viewport.w}
        height={viewport.h}
        draggable={stageDraggable}
        scaleX={scale}
        scaleY={scale}
        x={stagePos.x}
        y={stagePos.y}
        onDragStart={(e) => {
          if (!stageDraggable || e.target === e.target.getStage()) return;
          e.target.getStage()?.stopDrag();
        }}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            onStagePosChange({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onWheel={handleWheel}
        onClick={handleStageClick}
      >
        <Layer>
          {/* Viewport fill — avoids the “grey dead zone” beside a fixed-size stage */}
          <Rect
            x={-stagePos.x / scale}
            y={-stagePos.y / scale}
            width={viewport.w / scale}
            height={viewport.h / scale}
            fill="#edf4fa"
            listening={false}
          />
          <Rect x={0} y={0} width={worldW} height={worldH} fill="#e8eef5" cornerRadius={16} listening={false} />
          <Rect
            x={mToPx(cfg.warehouse_x_m)}
            y={mToPx(cfg.warehouse_y_m)}
            width={mToPx(cfg.warehouse_w_m)}
            height={mToPx(cfg.warehouse_h_m)}
            fill="#fafafa"
            stroke="#475569"
            strokeWidth={2}
            cornerRadius={10}
            listening={false}
          />
          <Text
            x={mToPx(cfg.warehouse_x_m + cfg.warehouse_w_m) - 210}
            y={mToPx(cfg.warehouse_y_m) + 8}
            text={`Toàn kho: ${occupancyStats.pct}% (${occupancyStats.occupied}/${occupancyStats.total} ô)`}
            fontSize={14}
            fontStyle="bold"
            fill="#1e40af"
            listening={false}
          />

          {editMode && (
            <Group listening={false}>
              {Array.from({ length: Math.ceil(cfg.warehouse_w_m / cfg.grid_step_m) + 1 }).map((_, i) => (
                <Line
                  key={`grid-v-${i}`}
                  points={[
                    mToPx(cfg.warehouse_x_m + i * cfg.grid_step_m),
                    mToPx(cfg.warehouse_y_m),
                    mToPx(cfg.warehouse_x_m + i * cfg.grid_step_m),
                    mToPx(cfg.warehouse_y_m + cfg.warehouse_h_m),
                  ]}
                  stroke="rgba(148,163,184,0.25)"
                  strokeWidth={1}
                />
              ))}
              {Array.from({ length: Math.ceil(cfg.warehouse_h_m / cfg.grid_step_m) + 1 }).map((_, i) => (
                <Line
                  key={`grid-h-${i}`}
                  points={[
                    mToPx(cfg.warehouse_x_m),
                    mToPx(cfg.warehouse_y_m + i * cfg.grid_step_m),
                    mToPx(cfg.warehouse_x_m + cfg.warehouse_w_m),
                    mToPx(cfg.warehouse_y_m + i * cfg.grid_step_m),
                  ]}
                  stroke="rgba(148,163,184,0.25)"
                  strokeWidth={1}
                />
              ))}
            </Group>
          )}

          {draft.zones.map((zone) => {
            const fillPct = zone.fill_pct ?? 0;
            const binTotal = zone.bin_count || (zone.bins || []).length || 0;
            const binOcc = zone.occupied_bins ?? 0;
            const rackTotal = zone.rack_count || draft.racks.filter((r) => r.zone_id === zone.zone_id).length;
            const selected = selectedZoneId === zone.zone_id;
            const zoneW = mToPx(zone.map_w);
            const zoneH = mToPx(zone.map_h);
            const zoneTransformTarget = transformEnabled && selected && !selectedRackKey;
            return (
              <Group
                key={zone.zone_id}
                ref={zoneTransformTarget ? zoneRef : null}
                x={mToPx(zone.map_x)}
                y={mToPx(zone.map_y)}
                draggable={zoneTransformTarget}
                onDragStart={(e) => { e.cancelBubble = true; }}
                onClick={(e) => handleMapPointer(e, () => onZoneSelect?.(zone.zone_id))}
                onDragEnd={(e) => {
                  if (!zoneTransformTarget) return;
                  e.cancelBubble = true;
                  const nx = snap(pxToM(e.target.x()), cfg.grid_step_m);
                  const ny = snap(pxToM(e.target.y()), cfg.grid_step_m);
                  e.target.position({ x: mToPx(nx), y: mToPx(ny) });
                  onZoneDragEnd?.(zone.zone_id, nx, ny);
                }}
                onTransformEnd={zoneTransformTarget ? handleZoneTransformEnd(zone) : undefined}
              >
                <Rect
                  x={0}
                  y={0}
                  width={zoneW}
                  height={zoneH}
                  fill="#ffffff"
                  stroke={selected ? '#111827' : zone.stroke}
                  strokeWidth={selected ? 3 : 2}
                  dash={[6, 4]}
                  cornerRadius={8}
                />
                <Rect
                  x={2}
                  y={2}
                  width={Math.max(0, zoneW - 4)}
                  height={Math.max(0, zoneH - 4)}
                  fill={zoneFillColor(fillPct)}
                  opacity={0.12}
                  cornerRadius={6}
                  listening={false}
                />
                <ZoneBinHeatmap
                  zone={zone}
                  mutedBinIds={mutedBinIds}
                  onBinClick={onBinClick}
                  editMode={editMode}
                  scale={scale}
                  relative
                />
                <Text
                  x={6}
                  y={4}
                  text={`${zone.label || zone.zone_name} ${fillPct}%`}
                  fontSize={11}
                  fontStyle="bold"
                  fill="#0f172a"
                  listening={false}
                />
                <Text
                  x={6}
                  y={17}
                  text={`${binOcc}/${binTotal} ô · ${rackTotal} kệ`}
                  fontSize={9}
                  fill="#475569"
                  listening={false}
                />
                {editMode && (
                  <Text
                    x={6}
                    y={zoneH - 16}
                    text={`${zone.map_w.toFixed(1)}×${zone.map_h.toFixed(1)} m`}
                    fontSize={9}
                    fill="#64748b"
                    listening={false}
                  />
                )}
              </Group>
            );
          })}

          {draft.paths.filter((path) => (path.points || []).length >= 2).map((path) => (
            <PathShape
              key={path.client_id}
              path={path}
              editMode={editMode}
              selected={selectedPathId === path.client_id}
              onSelect={onPathSelect}
              onSelectPoint={onPathPointSelect}
              onDragPoint={(clientId, index, point) => {
                const snapped = snapPoint(point, cfg.grid_step_m);
                onPathPointDrag?.(clientId, index, snapped);
              }}
            />
          ))}

          {(editMode || scale >= RACK_DETAIL_MIN_SCALE) && draft.racks.map((rack) => {
            const selected = selectedRackKey === rack.rack_key;
            const highlighted = (
              (highlightRackId != null && rack.rack_id === highlightRackId)
              || (highlightRackKey && highlightRackKey === rack.rack_key)
            );
            const rackTransformTarget = transformEnabled && selected;
            return (
              <Group
                key={rack.rack_id ? `rack-${rack.rack_id}` : rack.rack_key}
                ref={rackTransformTarget ? rackRef : null}
                x={mToPx(rack.x_m)}
                y={mToPx(rack.y_m)}
                rotation={rack.rotation_deg || 0}
                draggable={rackTransformTarget}
                onDragStart={(e) => { e.cancelBubble = true; }}
                onClick={(e) => handleMapPointer(e, () => onRackSelect?.(rack.rack_key))}
                onDragEnd={(e) => {
                  if (!rackTransformTarget) return;
                  e.cancelBubble = true;
                  const nx = snap(pxToM(e.target.x()), cfg.grid_step_m);
                  const ny = snap(pxToM(e.target.y()), cfg.grid_step_m);
                  e.target.position({ x: mToPx(nx), y: mToPx(ny) });
                  onRackDragEnd?.(rack.rack_key, nx, ny);
                }}
                onTransformEnd={rackTransformTarget ? handleRackTransformEnd(rack) : undefined}
              >
                <Rect
                  width={mToPx(rack.w_m)}
                  height={mToPx(rack.h_m)}
                  fill={highlighted
                    ? 'rgba(37, 99, 235, 0.12)'
                    : rackOccupancyFill(rack.occupied_slots || 0, rack.total_slots || 0)}
                  stroke={selected || highlighted ? '#111827' : '#94a3b8'}
                  strokeWidth={selected || highlighted ? 2.5 : 1.2}
                  cornerRadius={4}
                />
                <Text
                  text={rack.label}
                  x={4}
                  y={3}
                  fontSize={Math.max(7, Math.min(10, mToPx(rack.w_m) / 8))}
                  fontStyle="bold"
                  fill="#0f172a"
                  listening={false}
                  width={Math.max(20, mToPx(rack.w_m) - 6)}
                  ellipsis
                />
                {mToPx(rack.w_m) > 36 && (
                  <Text
                    text={`${rack.occupied_slots || 0}/${rack.total_slots || 0}`}
                    x={4}
                    y={14}
                    fontSize={8}
                    fill="#64748b"
                    listening={false}
                  />
                )}
                {(rack.bins || []).map((bin) => {
                  const slot = binSlotWithinRack(rack, bin);
                  const status = binStatus(bin);
                  const muted = mutedBinIds?.has(bin.bin_id);
                  return (
                    <Group
                      key={bin.bin_id}
                      x={mToPx(slot.x)}
                      y={mToPx(slot.y)}
                      listening={!(editMode && activeTool === 'select')}
                      onClick={(e) => {
                        e.cancelBubble = true;
                        if (!editMode) onBinClick?.(bin.bin_id);
                      }}
                      opacity={muted ? 0.25 : 1}
                    >
                      <Rect
                        width={mToPx(slot.w)}
                        height={mToPx(slot.h)}
                        fill={statusColor(status)}
                        stroke={statusStroke(status)}
                        strokeWidth={1}
                        cornerRadius={3}
                      />
                      <Text
                        text={String(bin.bin_code || '').slice(-4)}
                        x={2}
                        y={2}
                        fontSize={7}
                        fill="#334155"
                        listening={false}
                      />
                    </Group>
                  );
                })}
              </Group>
            );
          })}

          {transformEnabled && (
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              keepRatio={false}
              borderStroke="#111827"
              borderStrokeWidth={1.5}
              anchorFill="#ffffff"
              anchorStroke="#111827"
              anchorSize={9}
              anchorCornerRadius={2}
              boundBoxFunc={(oldBox, newBox) => {
                if (Math.abs(newBox.width) < mToPx(0.5) || Math.abs(newBox.height) < mToPx(0.5)) {
                  return oldBox;
                }
                return newBox;
              }}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}

export { MIN_SCALE, MAX_SCALE };
