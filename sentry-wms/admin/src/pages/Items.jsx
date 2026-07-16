import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import DataTable from '../components/DataTable.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';

const FILTER_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Archived', value: 'archived' },
  { label: 'All', value: 'all' },
];

const STORAGE_PROFILES = [
  { value: 'HEAVY', label: 'ZONE A — Hàng nặng' },
  { value: 'FMCG', label: 'ZONE B — FMCG nhẹ' },
  { value: 'FULFILLMENT', label: 'ZONE C — Fulfillment/backstock' },
  { value: 'PROJECT', label: 'ZONE D — Project/overflow' },
];
const KG_TO_LB = 2.2046226218;
const CM_TO_IN = 0.3937007874;

function numberOrNull(value) {
  return value === '' || value == null ? null : Number(value);
}

function itemToForm(item) {
  return {
    ...item,
    weight_kg: item.weight_lbs != null ? (Number(item.weight_lbs) / KG_TO_LB).toFixed(3) : '',
    length_cm: item.length_in != null ? (Number(item.length_in) / CM_TO_IN).toFixed(1) : '',
    width_cm: item.width_in != null ? (Number(item.width_in) / CM_TO_IN).toFixed(1) : '',
    height_cm: item.height_in != null ? (Number(item.height_in) / CM_TO_IN).toFixed(1) : '',
    barcode_aliases_text: (item.barcode_aliases || []).join('\n'),
  };
}

export default function Items() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [filter, setFilter] = useState('active');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  // Debounce typed search and guard against out-of-order responses.
  // Each run owns an AbortController; the cleanup cancels a pending
  // debounce timer (rapid typing) AND aborts an in-flight request (a
  // superseded query), so only the latest query's response reaches
  // setItems. Without this, slow broad-prefix queries (e.g. "1" matches
  // 23k items) resolve late and overwrite the narrow result, leaving
  // stale "floater" rows from earlier keystrokes. Page/filter changes
  // are discrete clicks, so they fire immediately (no debounce delay).
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => loadItems(controller.signal), search ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [page, search, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // signal is supplied by the debounced effect so a superseded query
  // aborts mid-flight. The mutation handlers (save/delete/archive) call
  // loadItems() with no signal and refetch unconditionally.
  async function loadItems(signal) {
    const params = new URLSearchParams({ page, per_page: 50 });
    if (search) params.set('q', search);
    if (filter === 'active') params.set('active', 'true');
    else if (filter === 'archived') params.set('active', 'false');
    let res;
    try {
      res = await api.get(`/admin/items?${params}`, { signal });
    } catch (err) {
      if (err?.name === 'AbortError') return; // superseded by a newer query
      throw err;
    }
    if (res?.ok) {
      const data = await res.json();
      const mapped = (data.items || []).map((item) => ({
        ...item,
        id: item.id || item.item_id,
      }));
      setItems(mapped);
      setPagination({ page: data.page, pages: data.pages, total: data.total, per_page: data.per_page });
    }
  }

  async function viewItem(item) {
    const res = await api.get(`/admin/items/${item.id}`);
    if (res?.ok) {
      const data = await res.json();
      const itemData = data.item || data;
      setDetail({
        ...itemData,
        id: itemData.id || itemData.item_id,
        inventory: data.inventory || itemData.inventory || [],
        preferred_bins: data.preferred_bins || itemData.preferred_bins || [],
      });
    }
  }

  function openCreate() {
    setEditId(null);
    setForm({
      is_active: true,
      is_lot_tracked: false,
      is_serial_tracked: false,
      reorder_point: 0,
      reorder_qty: 0,
    });
    setError('');
    setShowModal(true);
  }

  async function openEdit(item) {
    const id = item.id || item.item_id;
    setEditId(id);
    const res = await api.get(`/admin/items/${id}`);
    const data = res?.ok ? await res.json() : null;
    const fullItem = data?.item || item;
    setForm(itemToForm({ ...fullItem, id }));
    setError('');
    setShowModal(true);
  }

  async function save() {
    setError('');
    const body = {
      sku: form.sku,
      item_name: form.item_name,
      description: form.description || null,
      upc: form.upc || null,
      barcode_aliases: (form.barcode_aliases_text || '')
        .split(/[\n,;]+/)
        .map((value) => value.trim())
        .filter(Boolean),
      category: form.category || null,
      storage_profile: form.storage_profile || null,
      weight_lbs: form.weight_kg === '' || form.weight_kg == null
        ? null
        : Number(form.weight_kg) * KG_TO_LB,
      length_in: form.length_cm === '' || form.length_cm == null
        ? null
        : Number(form.length_cm) * CM_TO_IN,
      width_in: form.width_cm === '' || form.width_cm == null
        ? null
        : Number(form.width_cm) * CM_TO_IN,
      height_in: form.height_cm === '' || form.height_cm == null
        ? null
        : Number(form.height_cm) * CM_TO_IN,
      default_bin_id: form.default_bin_id ? Number(form.default_bin_id) : null,
      reorder_point: numberOrNull(form.reorder_point) ?? 0,
      reorder_qty: numberOrNull(form.reorder_qty) ?? 0,
      is_lot_tracked: !!form.is_lot_tracked,
      is_serial_tracked: !!form.is_serial_tracked,
    };
    const res = editId
      ? await api.put(`/admin/items/${editId}`, body)
      : await api.post('/admin/items', body);
    if (res?.ok) {
      setShowModal(false);
      setDetail(null);
      loadItems();
    } else {
      const data = await res?.json();
      setError(data?.error || 'Failed to save');
    }
  }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  async function deleteItem(id) {
    setShowDeleteConfirm(id);
  }

  async function confirmDeleteItem() {
    const id = showDeleteConfirm;
    setShowDeleteConfirm(null);
    const res = await api.delete(`/admin/items/${id}`);
    if (res?.ok) {
      setDetail(null);
      setShowModal(false);
      loadItems();
    } else {
      const data = await res?.json();
      setError(data?.error || 'Failed to delete item');
    }
  }

  async function toggleArchive(item) {
    const res = await api.post(`/admin/items/${item.id}/archive`);
    if (res?.ok) {
      setDetail(null);
      loadItems();
    } else {
      const data = await res?.json();
      setError(data?.error || 'Failed to update item');
    }
  }

  const columns = [
    { key: 'sku', label: 'SKU', mono: true },
    { key: 'item_name', label: 'Item Name' },
    { key: 'upc', label: 'UPC', mono: true, render: (r) => r.upc || '-' },
    { key: 'default_bin_code', label: 'Default Bin', mono: true, render: (r) => r.default_bin_code || '\u2013' },
    { key: 'storage_profile', label: '3PL Zone', render: (r) => r.storage_profile || '-' },
    { key: 'category', label: 'Category', render: (r) => r.category || '-' },
    { key: 'weight_lbs', label: 'Weight', render: (r) => r.weight_lbs != null ? `${(r.weight_lbs / KG_TO_LB).toFixed(2)} kg` : '-' },
    { key: 'is_active', label: 'Active', render: (r) => r.is_active ? 'Yes' : 'No' },
    { key: 'actions', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(r); }} aria-label="Edit" title="Edit">&#9998;</button>
        <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); deleteItem(r.id || r.item_id); }} aria-label="Delete" title="Delete">&#128465;</button>
      </div>
    )},
  ];

  const invCols = [
    { key: 'bin_code', label: 'Bin', mono: true },
    { key: 'quantity_on_hand', label: 'On Hand' },
    { key: 'quantity_allocated', label: 'Allocated' },
  ];

  return (
    <div>
      <PageHeader title="Items">
        <button className="btn btn-primary" onClick={openCreate}>New Item</button>
      </PageHeader>
      <div className="filter-bar">
        <input className="form-input" placeholder="Search by SKU, name, or UPC..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select
          className="form-select"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: 120 }}
        >
          {FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <DataTable columns={columns} data={items} pagination={pagination} onPageChange={setPage} onRowClick={viewItem} />

      {detail && !showModal && (
        <Modal title={detail.item_name || detail.sku} onClose={() => setDetail(null)}
          footer={<button className="btn" onClick={() => setDetail(null)}>Close</button>}
        >
          <div className="detail-grid">
            <span className="detail-label">SKU</span><span className="mono">{detail.sku}</span>
            <span className="detail-label">UPC</span><span className="mono">{detail.upc || '-'}</span>
            <span className="detail-label">Category</span><span>{detail.category || '-'}</span>
            <span className="detail-label">3PL Zone</span><span>{detail.storage_profile || '-'}</span>
            <span className="detail-label">Weight</span><span>{detail.weight_lbs != null ? `${(detail.weight_lbs / KG_TO_LB).toFixed(3)} kg` : '-'}</span>
            <span className="detail-label">Dimensions</span>
            <span>
              {[detail.length_in, detail.width_in, detail.height_in].every((v) => v != null)
                ? `${(detail.length_in / CM_TO_IN).toFixed(1)} × ${(detail.width_in / CM_TO_IN).toFixed(1)} × ${(detail.height_in / CM_TO_IN).toFixed(1)} cm`
                : '-'}
            </span>
            <span className="detail-label">Lot / Expiry</span><span>{detail.is_lot_tracked ? 'Tracked' : 'Not tracked'}</span>
            <span className="detail-label">Serial</span><span>{detail.is_serial_tracked ? 'Tracked' : 'Not tracked'}</span>
            <span className="detail-label">Reorder</span><span>{detail.reorder_point ?? 0} / qty {detail.reorder_qty ?? 0}</span>
            <span className="detail-label">Barcode aliases</span><span className="mono">{(detail.barcode_aliases || []).join(', ') || '-'}</span>
            <span className="detail-label">Description</span><span>{detail.description || '-'}</span>
            <span className="detail-label">Active</span><span>{detail.is_active ? 'Yes' : 'No'}</span>
          </div>
          {detail.preferred_bins && detail.preferred_bins.length > 0 && (
            <>
              <div className="section-title">Preferred Bins</div>
              <DataTable columns={[
                { key: 'bin_code', label: 'Bin', mono: true },
                { key: 'zone_name', label: 'Zone' },
                { key: 'priority', label: 'Priority' },
              ]} data={detail.preferred_bins} />
            </>
          )}
          {detail.inventory && detail.inventory.length > 0 && (
            <>
              <div className="section-title">Inventory locations</div>
              <DataTable columns={invCols} data={detail.inventory} />
            </>
          )}
        </Modal>
      )}

      {showModal && (
        <Modal title={editId ? 'Edit Item' : 'New Item'} onClose={() => setShowModal(false)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {editId && (
                  <button className="btn btn-sm" onClick={() => toggleArchive(form)}>
                    {form.is_active ? 'Archive' : 'Restore'}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={save}>Save</button>
              </div>
            </div>
          }
        >
          {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
          <div className="form-row">
            <div className="form-group">
              <label>SKU</label>
              <input className="form-input" value={form.sku || ''} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div className="form-group">
              <label>UPC</label>
              <input className="form-input" value={form.upc || ''} onChange={(e) => setForm({ ...form, upc: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label>Item Name</label>
            <input className="form-input" value={form.item_name || ''} onChange={(e) => setForm({ ...form, item_name: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Category</label>
              <input className="form-input" value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="form-group">
              <label>3PL storage profile</label>
              <select className="form-select" value={form.storage_profile || ''} onChange={(e) => setForm({ ...form, storage_profile: e.target.value })}>
                <option value="">Chưa phân loại</option>
                {STORAGE_PROFILES.map((profile) => (
                  <option key={profile.value} value={profile.value}>{profile.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Weight / pallet unit (kg)</label>
              <input className="form-input" type="number" min="0" step="0.001" value={form.weight_kg ?? ''} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Default bin ID</label>
              <input className="form-input" type="number" min="1" value={form.default_bin_id ?? ''} onChange={(e) => setForm({ ...form, default_bin_id: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Length (cm)</label>
              <input className="form-input" type="number" min="0" step="0.1" value={form.length_cm ?? ''} onChange={(e) => setForm({ ...form, length_cm: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Width (cm)</label>
              <input className="form-input" type="number" min="0" step="0.1" value={form.width_cm ?? ''} onChange={(e) => setForm({ ...form, width_cm: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Height (cm)</label>
              <input className="form-input" type="number" min="0" step="0.1" value={form.height_cm ?? ''} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} />
            </div>
          </div>
          {form.length_cm && form.width_cm && form.height_cm && (
            <div className="settings-note" style={{ marginTop: -4, marginBottom: 12 }}>
              CBM tính toán: {(Number(form.length_cm) * Number(form.width_cm) * Number(form.height_cm) / 1000000).toFixed(4)} m³
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label>Reorder point</label>
              <input className="form-input" type="number" min="0" value={form.reorder_point ?? 0} onChange={(e) => setForm({ ...form, reorder_point: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Reorder quantity</label>
              <input className="form-input" type="number" min="0" value={form.reorder_qty ?? 0} onChange={(e) => setForm({ ...form, reorder_qty: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <label className="checkbox-label">
              <input type="checkbox" checked={!!form.is_lot_tracked} onChange={(e) => setForm({ ...form, is_lot_tracked: e.target.checked })} />
              Track lot & expiry (FIFO/FEFO)
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={!!form.is_serial_tracked} onChange={(e) => setForm({ ...form, is_serial_tracked: e.target.checked })} />
              Track serial number
            </label>
          </div>
          <div className="form-group">
            <label>Alternate barcodes <span className="settings-note">(one per line)</span></label>
            <textarea className="form-input" rows="3" value={form.barcode_aliases_text || ''} onChange={(e) => setForm({ ...form, barcode_aliases_text: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Description / handling notes</label>
            <textarea className="form-input" rows="3" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </Modal>
      )}

      {showDeleteConfirm && (
        <Modal title="Delete Item" onClose={() => setShowDeleteConfirm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeleteItem}>Delete</button>
            </>
          }
        >
          <p style={{ fontSize: 14, marginBottom: 8 }}>Are you sure? This action cannot be undone.</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>The item and all associated data will be permanently deleted.</p>
        </Modal>
      )}
    </div>
  );
}
