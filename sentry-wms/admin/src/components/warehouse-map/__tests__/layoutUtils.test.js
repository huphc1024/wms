import { describe, expect, it } from 'vitest';
import {
  buildInitialDraft,
  rectsOverlap,
  serializeDraftForSave,
  snap,
  validateDraftLocally,
} from '../layoutUtils.js';

describe('layoutUtils', () => {
  it('snaps coordinates to grid', () => {
    expect(snap(10.13, 0.25)).toBe(10.25);
    expect(snap(10.11, 0.25)).toBe(10);
  });

  it('detects rack overlap', () => {
    expect(rectsOverlap(
      { x_m: 1, y_m: 1, w_m: 2, h_m: 2 },
      { x_m: 2.5, y_m: 1, w_m: 2, h_m: 2 },
    )).toBe(true);
    expect(rectsOverlap(
      { x_m: 1, y_m: 1, w_m: 2, h_m: 2 },
      { x_m: 4, y_m: 1, w_m: 2, h_m: 2 },
    )).toBe(false);
  });

  it('builds draft with default paths when layout is unsaved', () => {
    const draft = buildInitialDraft({
      warehouse_id: 1,
      zones: [{ zone_id: 1, zone_code: 'FAST', zone_name: 'Fast', zone_type: 'STORAGE', fill_pct: 10, occupied_bins: 1, bin_count: 4 }],
      racks: [{ rack_key: '1|A|001', zone_id: 1, rack_label: 'A-001', total_slots: 2, occupied_slots: 1 }],
      bins: [],
      layout: { has_saved_layout: false, config: {}, racks: [], paths: [] },
    });
    expect(draft.paths.length).toBeGreaterThan(0);
    expect(draft.baseVersion).toBe(0);
  });

  it('filters incomplete paths before save', () => {
    const draft = buildInitialDraft({
      zones: [],
      racks: [],
      bins: [],
      layout: { has_saved_layout: false, config: {}, racks: [], paths: [] },
    });
    draft.paths.push({
      client_id: 'bad',
      path_type: 'FORKLIFT',
      points: [{ x: 1, y: 1 }],
      width_m: 3,
    });
    const payload = serializeDraftForSave(draft);
    expect(payload.paths.every((path) => path.points.length >= 2)).toBe(true);
    expect(payload.layout.coordinate_unit).toBe('METER');
  });

  it('preserves stable rack ids while keeping the legacy key', () => {
    const draft = buildInitialDraft({
      zones: [],
      racks: [{
        rack_id: 42,
        rack_key: '1|A|001',
        zone_id: 1,
        rack_label: 'A-001',
        total_slots: 1,
        occupied_slots: 0,
      }],
      bins: [{ bin_id: 7, rack_id: 42, rack_key: '1|A|001' }],
      layout: { has_saved_layout: true, config: { version: 2 }, racks: [], paths: [] },
    });
    const payload = serializeDraftForSave(draft);
    expect(payload.racks[0]).toMatchObject({ rack_id: 42, rack_key: '1|A|001' });
  });

  it('validates racks inside warehouse bounds', () => {
    const draft = buildInitialDraft({
      zones: [],
      racks: [{
        rack_key: 'r1',
        zone_id: 1,
        rack_label: 'R1',
        total_slots: 1,
        occupied_slots: 0,
      }],
      bins: [],
      layout: { has_saved_layout: false, config: {}, racks: [], paths: [] },
    });
    draft.racks[0].x_m = 40;
    draft.racks[0].y_m = 35;
    draft.racks[0].w_m = 10;
    draft.racks[0].h_m = 10;
    const { errors } = validateDraftLocally(draft);
    expect(errors.length).toBeGreaterThan(0);
  });
});
