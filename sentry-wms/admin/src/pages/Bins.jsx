import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useWarehouse } from '../warehouse.jsx';
import DataTable from '../components/DataTable.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';

const BIN_TYPES = ['Staging', 'PickableStaging', 'Pickable'];
const KG_TO_LB = 2.2046226218;
const M3_TO_CUFT = 35.3146667;

function binToForm(bin) {
  return {
    ...bin,
    max_weight_kg: bin.max_weight_lbs != null
      ? (Number(bin.max_weight_lbs) / KG_TO_LB).toFixed(1)
      : '',
    max_volume_m3: bin.max_volume_cuft != null
      ? (Number(bin.max_volume_cuft) / M3_TO_CUFT).toFixed(3)
      : '',
  };
}

export default function Bins() {
  const { warehouseId } = useWarehouse();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [bins, setBins] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [zones, setZones] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { if (warehouseId) { loadBins(); loadZones(); } }, [warehouseId, search, page]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function loadBins() {
    const params = new URLSearchParams({ warehouse_id: String(warehouseId), page, per_page: 50 });
    if (search) params.set('q', search);
    const res = await api.get(`/admin/bins?${params}`);
    if (res?.ok) {
      const data = await res.json();
      setBins(data.bins || []);
      setPagination({ page: data.page, pages: data.pages, total: data.total, per_page: data.per_page });
    }
  }

  // Walks all pages and downloads the full result set as CSV. The API's
  // admin/bins endpoint caps page_size at 50 regardless of `per_page`,
  // so we paginate server-side and concat client-side. CSV mirrors the
  // BinImportRow schema (bin_code, bin_barcode, zone, warehouse_id,
  // bin_type, aisle, pick_sequence, putaway_sequence, description) so
  // an exported file is round-trip-importable via /admin/import/bins.
  async function exportCsv() {
    setExporting(true);
    try {
      const all = [];
      let p = 1;
      // Hard stop at 200 pages (=10k bins) to avoid runaway
      while (p <= 200) {
        const params = new URLSearchParams({ warehouse_id: String(warehouseId), page: p, per_page: 50 });
        if (search) params.set('q', search);
        const res = await api.get(`/admin/bins?${params}`);
        if (!res?.ok) break;
        const data = await res.json();
        all.push(...(data.bins || []));
        if (p >= (data.pages || 1)) break;
        p += 1;
      }
      const headers = [
        'bin_code','bin_barcode','zone','warehouse_id','bin_type','aisle',
        'row_num','level_num','position_num','pick_sequence','putaway_sequence',
        'max_weight_lbs','max_volume_cuft','description',
      ];
      const csvEscape = (v) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [headers.join(',')];
      for (const b of all) {
        lines.push([
          csvEscape(b.bin_code),
          csvEscape(b.bin_barcode),
          csvEscape(b.zone_name || b.zone || ''),
          csvEscape(b.warehouse_id ?? warehouseId),
          csvEscape(b.bin_type),
          csvEscape(b.aisle ?? ''),
          csvEscape(b.row_num ?? ''),
          csvEscape(b.level_num ?? ''),
          csvEscape(b.position_num ?? ''),
          csvEscape(b.pick_sequence ?? ''),
          csvEscape(b.putaway_sequence ?? ''),
          csvEscape(b.max_weight_lbs ?? ''),
          csvEscape(b.max_volume_cuft ?? ''),
          csvEscape(b.description ?? ''),
        ].join(','));
      }
      const csv = lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const today = new Date().toISOString().split('T')[0];
      link.download = `bins_warehouse${warehouseId}_${today}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function loadZones() {
    const res = await api.get(`/admin/zones?warehouse_id=${warehouseId}`);
    if (res?.ok) {
      const data = await res.json();
      setZones(data.zones || []);
    }
  }

  async function viewBin(bin) {
    setSelected(bin);
    setEditing(false);
    const res = await api.get(`/admin/bins/${bin.bin_id}`);
    if (res?.ok) {
      const data = await res.json();
      const flat = { ...(data.bin || {}), inventory: data.inventory || [] };
      setDetail(flat);
      setForm(binToForm(flat));
    }
  }

  function openEditFromRow(r) {
    setSelected(r);
    setForm(binToForm(r));
    setEditing(true);
    setError('');
  }

  async function deleteBin() {
    setError('');
    const target = deleteTarget;
    if (!target) return;
    const res = await api.delete(`/admin/bins/${target.bin_id}`);
    if (res?.ok) {
      setDeleteTarget(null);
      loadBins();
    } else {
      const data = await res?.json();
      setError(data?.error || 'Failed to delete');
      setDeleteTarget(null);
    }
  }

  async function saveBin() {
    setError('');
    const body = {
      bin_code: form.bin_code,
      bin_barcode: form.bin_barcode,
      bin_type: form.bin_type,
      zone_id: form.zone_id ? Number(form.zone_id) : null,
      aisle: form.aisle || null,
      row_num: form.row_num !== '' && form.row_num != null ? Number(form.row_num) : null,
      level_num: form.level_num !== '' && form.level_num != null ? Number(form.level_num) : null,
      position_num: form.position_num !== '' && form.position_num != null ? Number(form.position_num) : null,
      pick_sequence: form.pick_sequence !== '' && form.pick_sequence != null ? Number(form.pick_sequence) : 0,
      putaway_sequence: form.putaway_sequence !== '' && form.putaway_sequence != null ? Number(form.putaway_sequence) : 0,
      max_weight_lbs: form.max_weight_kg !== '' && form.max_weight_kg != null
        ? Number(form.max_weight_kg) * KG_TO_LB
        : null,
      max_volume_cuft: form.max_volume_m3 !== '' && form.max_volume_m3 != null
        ? Number(form.max_volume_m3) * M3_TO_CUFT
        : null,
      description: form.description || null,
    };
    const res = editing
      ? await api.put(`/admin/bins/${selected.bin_id}`, { ...body, is_active: !!form.is_active })
      : await api.post('/admin/bins', { ...body, warehouse_id: warehouseId });
    if (res?.ok) {
      setSelected(null); setDetail(null); setShowCreate(false); setEditing(false);
      loadBins();
    } else {
      const data = await res?.json();
      setError(data?.error || 'Failed to save');
    }
  }

  const columns = [
    { key: 'bin_code', label: 'Bin Code', mono: true },
    { key: 'bin_barcode', label: 'Barcode', mono: true },
    { key: 'bin_type', label: 'Type' },
    { key: 'zone_name', label: 'Zone' },
    { key: 'aisle', label: 'Aisle' },
    { key: 'row_num', label: 'Bay' },
    { key: 'level_num', label: 'Level' },
    { key: 'position_num', label: 'Pos' },
    { key: 'max_weight_lbs', label: 'Max load', render: (r) => r.max_weight_lbs != null ? `${(r.max_weight_lbs / KG_TO_LB).toFixed(0)} kg` : '-' },
    { key: 'pick_sequence', label: 'Pick Seq' },
    { key: 'is_active', label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No' },
    { key: 'actions', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); openEditFromRow(r); }} aria-label="Edit" title="Edit">&#9998;</button>
        <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }} aria-label="Delete" title="Delete">&#128465;</button>
      </div>
    )},
  ];

  const invCols = [
    { key: 'sku', label: 'SKU', mono: true },
    { key: 'item_name', label: 'Item' },
    { key: 'quantity_on_hand', label: 'On Hand' },
    { key: 'quantity_allocated', label: 'Allocated' },
  ];

  function renderForm() {
    return (
      <>
        {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="form-row">
          <div className="form-group">
            <label>Bin Code</label>
            <input className="form-input" value={form.bin_code || ''} onChange={(e) => setForm({ ...form, bin_code: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Barcode</label>
            <input className="form-input" value={form.bin_barcode || ''} onChange={(e) => setForm({ ...form, bin_barcode: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Type</label>
            <select className="form-select" value={form.bin_type || ''} onChange={(e) => setForm({ ...form, bin_type: e.target.value })}>
              <option value="">Select type</option>
              {BIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Zone</label>
            <select className="form-select" value={form.zone_id || ''} onChange={(e) => setForm({ ...form, zone_id: Number(e.target.value) })}>
              <option value="">Select zone</option>
              {zones.map((z) => <option key={z.zone_id} value={z.zone_id}>{z.zone_code} - {z.zone_name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Aisle</label>
            <input className="form-input" value={form.aisle || ''} onChange={(e) => setForm({ ...form, aisle: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Bay</label>
            <input className="form-input" type="number" min="0" value={form.row_num ?? ''} onChange={(e) => setForm({ ...form, row_num: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Level (1–4)</label>
            <input className="form-input" type="number" min="1" max="4" value={form.level_num ?? ''} onChange={(e) => setForm({ ...form, level_num: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Pallet position (1–2)</label>
            <input className="form-input" type="number" min="1" max="2" value={form.position_num ?? ''} onChange={(e) => setForm({ ...form, position_num: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Max load (kg)</label>
            <input className="form-input" type="number" min="0" step="1" value={form.max_weight_kg ?? ''} onChange={(e) => setForm({ ...form, max_weight_kg: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Max volume (m³)</label>
            <input className="form-input" type="number" min="0" step="0.001" value={form.max_volume_m3 ?? ''} onChange={(e) => setForm({ ...form, max_volume_m3: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Pick sequence</label>
            <input className="form-input" type="number" min="0" value={form.pick_sequence ?? ''} onChange={(e) => setForm({ ...form, pick_sequence: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Put-away sequence</label>
            <input className="form-input" type="number" min="0" value={form.putaway_sequence ?? ''} onChange={(e) => setForm({ ...form, putaway_sequence: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label>Description / load notes</label>
          <textarea className="form-input" rows="3" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </>
    );
  }

  return (
    <div>
      <PageHeader title="Bins">
        <input
          className="form-input"
          style={{ maxWidth: 320, marginRight: 8 }}
          placeholder="Search by bin code or barcode"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <button
          className="btn"
          onClick={exportCsv}
          disabled={exporting || !pagination?.total}
          style={{ marginRight: 8 }}
          title="Export current filter to CSV"
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
        <button className="btn btn-primary" onClick={() => { setForm({ is_active: true }); setShowCreate(true); setError(''); }}>New Bin</button>
      </PageHeader>
      <DataTable columns={columns} data={bins} pagination={pagination} onPageChange={setPage} onRowClick={viewBin} />

      {selected && detail && !editing && (
        <Modal title={`Bin ${detail.bin_code}`} onClose={() => { setSelected(null); setDetail(null); setError(''); }}
          footer={
            <button className="btn" onClick={() => { setEditing(true); setForm(detail); setError(''); }}>Edit</button>
          }
        >
          <div className="detail-grid">
            <span className="detail-label">Code</span><span className="mono">{detail.bin_code}</span>
            <span className="detail-label">Barcode</span><span className="mono">{detail.bin_barcode}</span>
            <span className="detail-label">Type</span><span>{detail.bin_type}</span>
            <span className="detail-label">Zone</span><span>{detail.zone_name || '-'}</span>
            <span className="detail-label">Aisle</span><span>{detail.aisle || '-'}</span>
            <span className="detail-label">Bay / Level / Position</span>
            <span>{detail.row_num || '-'} / {detail.level_num || '-'} / {detail.position_num || '-'}</span>
            <span className="detail-label">Max load</span>
            <span>{detail.max_weight_lbs != null ? `${(detail.max_weight_lbs / KG_TO_LB).toFixed(1)} kg` : '-'}</span>
            <span className="detail-label">Max volume</span>
            <span>{detail.max_volume_cuft != null ? `${(detail.max_volume_cuft / M3_TO_CUFT).toFixed(3)} m³` : '-'}</span>
            <span className="detail-label">Pick Seq</span><span>{detail.pick_sequence ?? '-'}</span>
            <span className="detail-label">Put-away Seq</span><span>{detail.putaway_sequence ?? '-'}</span>
            <span className="detail-label">Notes</span><span>{detail.description || '-'}</span>
            <span className="detail-label">Active</span><span>{detail.is_active ? 'Yes' : 'No'}</span>
          </div>
          {detail.inventory && detail.inventory.length > 0 && (
            <>
              <div className="section-title">Inventory</div>
              <DataTable columns={invCols} data={detail.inventory} />
            </>
          )}
          {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title={`Delete bin ${deleteTarget.bin_code}?`}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={deleteBin}>Delete</button>
            </>
          }
        >
          <p style={{ fontSize: 13 }}>
            This permanently removes bin <span className="mono">{deleteTarget.bin_code}</span>. Inventory with
            quantity on hand and preferred-bin references must be cleared first.
          </p>
          {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}
        </Modal>
      )}

      {(editing || showCreate) && (
        <Modal
          title={editing ? `Edit Bin ${form.bin_code}` : 'New Bin'}
          onClose={() => { setEditing(false); setShowCreate(false); setSelected(null); setDetail(null); }}
          footer={
            <>
              <button className="btn" onClick={() => { setEditing(false); setShowCreate(false); setSelected(null); setDetail(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={saveBin}>Save</button>
            </>
          }
        >
          {renderForm()}
        </Modal>
      )}
    </div>
  );
}
