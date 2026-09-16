import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';

const SERVICE_TYPES = ['STORAGE', 'INBOUND', 'OUTBOUND', 'PICK_PACK', 'HANDLING'];
const UNITS = ['PALLET_DAY', 'PALLET', 'CBM', 'PER_ORDER', 'PER_SKU', 'UNIT'];

export default function RateCards() {
  const [cards, setCards] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [cardRes, customerRes, contractRes] = await Promise.all([
      api.get('/admin/rate-cards?per_page=1000'),
      api.get('/admin/customers?active=true'),
      api.get('/admin/customer-contracts'),
    ]);
    if (cardRes?.ok) setCards((await cardRes.json()).rate_cards || []);
    if (customerRes?.ok) setCustomers((await customerRes.json()).customers || []);
    if (contractRes?.ok) setContracts((await contractRes.json()).contracts || []);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const customerContracts = contracts.filter(
    (contract) => !form?.customer_id || contract.customer_id === form.customer_id,
  );

  async function save() {
    if (!form?.service_type || !form?.unit || form?.unit_price === '') {
      setError('Loại dịch vụ, đơn vị và đơn giá là bắt buộc'); return;
    }
    const body = {
      customer_id: form.customer_id || null,
      contract_id: form.contract_id ? Number(form.contract_id) : null,
      warehouse_id: form.warehouse_id ? Number(form.warehouse_id) : null,
      rate_name: form.rate_name || null,
      service_type: form.service_type,
      unit: form.unit,
      unit_price: Number(form.unit_price),
      currency: form.currency || 'VND',
      effective_from: form.effective_from || null,
      effective_to: form.effective_to || null,
    };
    const res = form.rate_card_id
      ? await api.put(`/admin/rate-cards/${form.rate_card_id}`, body)
      : await api.post('/admin/rate-cards', body);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setError(data?.error || 'Không lưu được bảng giá'); return;
    }
    setForm(null); setError(''); load();
  }

  const columns = [
    { key: 'rate_name', label: 'Tên mức giá', render: (row) => row.rate_name || row.service_type },
    { key: 'customer_name', label: 'Khách hàng', render: (row) => row.customer_name || 'Giá mặc định' },
    { key: 'contract_number', label: 'Hợp đồng', render: (row) => row.contract_number || '—' },
    { key: 'service_type', label: 'Dịch vụ' },
    { key: 'unit', label: 'Đơn vị' },
    { key: 'unit_price', label: 'Đơn giá', render: (row) => `${Number(row.unit_price).toLocaleString('vi-VN')} ${row.currency}` },
    { key: 'effective_from', label: 'Hiệu lực', render: (row) => `${row.effective_from || 'Không giới hạn'} → ${row.effective_to || 'Không giới hạn'}` },
    { key: 'actions', label: '', render: (row) => <div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn btn-sm" onClick={() => { setError(''); setForm({ ...row }); }}>Sửa</button><button type="button" className="btn btn-sm btn-danger" onClick={async () => { if (window.confirm('Xóa mức giá này?')) { await api.delete(`/admin/rate-cards/${row.rate_card_id}`); load(); } }}>Xóa</button></div> },
  ];

  return (
    <div>
      <PageHeader title="Bảng giá dịch vụ"><button type="button" className="btn btn-primary" onClick={() => setForm({ currency: 'VND', unit_price: '', service_type: 'STORAGE', unit: 'PALLET_DAY' })}>Thêm mức giá</button></PageHeader>
      <DataTable columns={columns} data={cards} />
      {form && (
        <Modal title={form.rate_card_id ? 'Cập nhật mức giá' : 'Thêm mức giá'} onClose={() => setForm(null)} footer={<><button type="button" className="btn" onClick={() => setForm(null)}>Hủy</button><button type="button" className="btn btn-primary" onClick={save}>Lưu</button></>}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group"><label htmlFor="rate-name">Tên mức giá</label><input id="rate-name" className="form-input" placeholder="VD: Lưu kho pallet tiêu chuẩn" value={form.rate_name || ''} onChange={(e) => setForm({ ...form, rate_name: e.target.value })} /></div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="rate-customer">Khách hàng</label><select id="rate-customer" className="form-input" disabled={Boolean(form.rate_card_id)} value={form.customer_id || ''} onChange={(e) => setForm({ ...form, customer_id: e.target.value, contract_id: '' })}><option value="">Giá mặc định cho tất cả</option>{customers.map((customer) => <option key={customer.customer_id} value={customer.customer_id}>{customer.customer_code} · {customer.customer_name}</option>)}</select></div>
            <div className="form-group"><label htmlFor="rate-contract">Hợp đồng</label><select id="rate-contract" className="form-input" value={form.contract_id || ''} onChange={(e) => setForm({ ...form, contract_id: e.target.value })}><option value="">Không gắn hợp đồng</option>{customerContracts.map((contract) => <option key={contract.contract_id} value={contract.contract_id}>{contract.contract_number} · {contract.contract_name}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="service-type">Loại dịch vụ *</label><select id="service-type" className="form-input" value={form.service_type || ''} onChange={(e) => setForm({ ...form, service_type: e.target.value })}>{SERVICE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></div>
            <div className="form-group"><label htmlFor="rate-unit">Đơn vị tính *</label><select id="rate-unit" className="form-input" value={form.unit || ''} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="unit-price">Đơn giá *</label><input id="unit-price" className="form-input" type="number" min="0" value={form.unit_price ?? ''} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} /></div>
            <div className="form-group"><label htmlFor="rate-currency">Tiền tệ</label><select id="rate-currency" className="form-input" value={form.currency || 'VND'} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option>VND</option><option>USD</option></select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="rate-from">Hiệu lực từ</label><input id="rate-from" className="form-input" type="date" value={form.effective_from || ''} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></div>
            <div className="form-group"><label htmlFor="rate-to">Hiệu lực đến</label><input id="rate-to" className="form-input" type="date" value={form.effective_to || ''} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
