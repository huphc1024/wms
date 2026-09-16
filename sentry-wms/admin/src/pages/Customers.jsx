import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';

const EMPTY_CUSTOMER = { payment_terms_days: 30, default_currency: 'VND', is_active: true };
const EMPTY_CONTRACT = { status: 'DRAFT', billing_cycle: 'MONTHLY', payment_terms_days: 30, currency: 'VND' };

async function responseError(res, fallback) {
  const data = await res?.json().catch(() => ({}));
  return data?.error || fallback;
}

export default function Customers() {
  const [tab, setTab] = useState('customers');
  const [customers, setCustomers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [customerForm, setCustomerForm] = useState(null);
  const [contractForm, setContractForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [printingContractId, setPrintingContractId] = useState(null);

  const load = useCallback(async () => {
    const [customerRes, contractRes, warehouseRes] = await Promise.all([
      api.get('/admin/customers'),
      api.get('/admin/customer-contracts'),
      api.get('/admin/warehouses?per_page=1000'),
    ]);
    if (customerRes?.ok) setCustomers((await customerRes.json()).customers || []);
    if (contractRes?.ok) setContracts((await contractRes.json()).contracts || []);
    if (warehouseRes?.ok) {
      const data = await warehouseRes.json();
      setWarehouses(data.warehouses || data || []);
    }
  }, []);

  // Initial remote-data hydration is intentionally effect-driven.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const activeCustomers = useMemo(
    () => customers.filter((customer) => customer.is_active),
    [customers],
  );

  async function saveCustomer() {
    if (!customerForm?.customer_name?.trim()) {
      setError('Tên khách hàng là bắt buộc');
      return;
    }
    setSaving(true); setError('');
    const body = {
      ...customerForm,
      payment_terms_days: Number(customerForm.payment_terms_days || 0),
    };
    const res = customerForm.customer_id
      ? await api.put(`/admin/customers/${customerForm.customer_id}`, body)
      : await api.post('/admin/customers', body);
    setSaving(false);
    if (!res?.ok) { setError(await responseError(res, 'Không lưu được khách hàng')); return; }
    setCustomerForm(null); await load();
  }

  async function saveContract() {
    if (!contractForm?.customer_id || !contractForm?.contract_name || !contractForm?.start_date) {
      setError('Khách hàng, tên hợp đồng và ngày bắt đầu là bắt buộc');
      return;
    }
    setSaving(true); setError('');
    const body = {
      ...contractForm,
      warehouse_id: contractForm.warehouse_id ? Number(contractForm.warehouse_id) : null,
      payment_terms_days: Number(contractForm.payment_terms_days || 0),
    };
    const res = contractForm.contract_id
      ? await api.put(`/admin/customer-contracts/${contractForm.contract_id}`, body)
      : await api.post('/admin/customer-contracts', body);
    setSaving(false);
    if (!res?.ok) { setError(await responseError(res, 'Không lưu được hợp đồng')); return; }
    setContractForm(null); await load();
  }

  async function printContract(contract) {
    setPrintingContractId(contract.contract_id);
    setError('');
    const res = await api.get(`/admin/customer-contracts/${contract.contract_id}/pdf`);
    setPrintingContractId(null);
    if (!res?.ok) {
      setError(await responseError(res, 'Không tạo được file PDF hợp đồng'));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hop-dong-${contract.contract_number || contract.contract_id}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const customerColumns = [
    { key: 'customer_code', label: 'Mã KH' },
    { key: 'customer_name', label: 'Khách hàng' },
    { key: 'contact_person', label: 'Liên hệ' },
    { key: 'phone', label: 'Điện thoại' },
    { key: 'tax_id', label: 'Mã số thuế' },
    { key: 'contract_count', label: 'Hợp đồng' },
    { key: 'unbilled_amount', label: 'Chưa xuất HĐ', render: (row) => Number(row.unbilled_amount || 0).toLocaleString('vi-VN') },
    { key: 'is_active', label: 'Trạng thái', render: (row) => <span className={`status-tag ${row.is_active ? 'status-active' : 'status-cancelled'}`}>{row.is_active ? 'Đang hoạt động' : 'Ngừng'}</span> },
    { key: 'actions', label: '', render: (row) => <button type="button" className="btn btn-sm" onClick={() => { setError(''); setCustomerForm({ ...row }); }}>Sửa</button> },
  ];

  const contractColumns = [
    { key: 'contract_number', label: 'Số hợp đồng' },
    { key: 'contract_name', label: 'Tên hợp đồng' },
    { key: 'customer_name', label: 'Khách hàng' },
    { key: 'warehouse_name', label: 'Kho áp dụng', render: (row) => row.warehouse_name || 'Tất cả kho' },
    { key: 'start_date', label: 'Bắt đầu' },
    { key: 'end_date', label: 'Kết thúc', render: (row) => row.end_date || 'Không thời hạn' },
    { key: 'rate_count', label: 'Số mức giá' },
    { key: 'status', label: 'Trạng thái', render: (row) => <span className={`status-tag status-${String(row.status).toLowerCase()}`}>{row.status}</span> },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-sm" onClick={() => { setError(''); setContractForm({ ...row }); }}>Sửa</button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={printingContractId === row.contract_id}
            onClick={() => printContract(row)}
          >
            {printingContractId === row.contract_id ? 'Đang tạo PDF...' : 'In hợp đồng'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Khách hàng & hợp đồng">
        <button type="button" className="btn btn-primary" onClick={() => {
          setError('');
          if (tab === 'customers') setCustomerForm({ ...EMPTY_CUSTOMER });
          else setContractForm({ ...EMPTY_CONTRACT });
        }}>
          {tab === 'customers' ? 'Thêm khách hàng' : 'Tạo hợp đồng'}
        </button>
      </PageHeader>

      <div className="commercial-tabs" role="tablist" aria-label="Quản lý khách hàng">
        <button type="button" className={`commercial-tab ${tab === 'customers' ? 'active' : ''}`} onClick={() => setTab('customers')}>Khách hàng <span>{customers.length}</span></button>
        <button type="button" className={`commercial-tab ${tab === 'contracts' ? 'active' : ''}`} onClick={() => setTab('contracts')}>Hợp đồng <span>{contracts.length}</span></button>
      </div>

      {error && !customerForm && !contractForm && <div className="alert alert-error">{error}</div>}

      {tab === 'customers'
        ? <DataTable columns={customerColumns} data={customers} />
        : <DataTable columns={contractColumns} data={contracts} />}

      {customerForm && (
        <Modal title={customerForm.customer_id ? 'Cập nhật khách hàng' : 'Thêm khách hàng'} onClose={() => setCustomerForm(null)} footer={<><button type="button" className="btn" onClick={() => setCustomerForm(null)}>Hủy</button><button type="button" className="btn btn-primary" disabled={saving} onClick={saveCustomer}>{saving ? 'Đang lưu...' : 'Lưu'}</button></>}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-row">
            <div className="form-group"><label htmlFor="customer-code">Mã khách hàng</label><input id="customer-code" className="form-input" placeholder="Tự sinh nếu bỏ trống" value={customerForm.customer_code || ''} onChange={(e) => setCustomerForm({ ...customerForm, customer_code: e.target.value })} /></div>
            <div className="form-group"><label htmlFor="customer-name">Tên khách hàng *</label><input id="customer-name" className="form-input" value={customerForm.customer_name || ''} onChange={(e) => setCustomerForm({ ...customerForm, customer_name: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="customer-contact">Người liên hệ</label><input id="customer-contact" className="form-input" value={customerForm.contact_person || ''} onChange={(e) => setCustomerForm({ ...customerForm, contact_person: e.target.value })} /></div>
            <div className="form-group"><label htmlFor="customer-phone">Điện thoại</label><input id="customer-phone" className="form-input" value={customerForm.phone || ''} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="customer-email">Email</label><input id="customer-email" type="email" className="form-input" value={customerForm.email || ''} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} /></div>
            <div className="form-group"><label htmlFor="customer-tax">Mã số thuế</label><input id="customer-tax" className="form-input" value={customerForm.tax_id || ''} onChange={(e) => setCustomerForm({ ...customerForm, tax_id: e.target.value })} /></div>
          </div>
          <div className="form-group"><label htmlFor="billing-address">Địa chỉ xuất hóa đơn</label><textarea id="billing-address" className="form-input" rows="2" value={customerForm.billing_address || ''} onChange={(e) => setCustomerForm({ ...customerForm, billing_address: e.target.value })} /></div>
          <div className="form-group"><label htmlFor="shipping-address">Địa chỉ giao nhận</label><textarea id="shipping-address" className="form-input" rows="2" value={customerForm.shipping_address || ''} onChange={(e) => setCustomerForm({ ...customerForm, shipping_address: e.target.value })} /></div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="payment-terms">Hạn thanh toán (ngày)</label><input id="payment-terms" type="number" min="0" max="365" className="form-input" value={customerForm.payment_terms_days ?? 30} onChange={(e) => setCustomerForm({ ...customerForm, payment_terms_days: e.target.value })} /></div>
            <div className="form-group"><label htmlFor="customer-currency">Tiền tệ</label><select id="customer-currency" className="form-input" value={customerForm.default_currency || 'VND'} onChange={(e) => setCustomerForm({ ...customerForm, default_currency: e.target.value })}><option value="VND">VND</option><option value="USD">USD</option></select></div>
          </div>
        </Modal>
      )}

      {contractForm && (
        <Modal title={contractForm.contract_id ? 'Cập nhật hợp đồng' : 'Tạo hợp đồng'} onClose={() => setContractForm(null)} footer={<><button type="button" className="btn" onClick={() => setContractForm(null)}>Hủy</button><button type="button" className="btn btn-primary" disabled={saving} onClick={saveContract}>{saving ? 'Đang lưu...' : 'Lưu hợp đồng'}</button></>}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-row">
            <div className="form-group"><label htmlFor="contract-number">Số hợp đồng</label><input id="contract-number" className="form-input" disabled={Boolean(contractForm.contract_id)} placeholder="Tự sinh nếu bỏ trống" value={contractForm.contract_number || ''} onChange={(e) => setContractForm({ ...contractForm, contract_number: e.target.value })} /></div>
            <div className="form-group"><label htmlFor="contract-customer">Khách hàng *</label><select id="contract-customer" className="form-input" disabled={Boolean(contractForm.contract_id)} value={contractForm.customer_id || ''} onChange={(e) => setContractForm({ ...contractForm, customer_id: e.target.value })}><option value="">Chọn khách hàng</option>{activeCustomers.map((customer) => <option key={customer.customer_id} value={customer.customer_id}>{customer.customer_code} · {customer.customer_name}</option>)}</select></div>
          </div>
          <div className="form-group"><label htmlFor="contract-name">Tên hợp đồng *</label><input id="contract-name" className="form-input" value={contractForm.contract_name || ''} onChange={(e) => setContractForm({ ...contractForm, contract_name: e.target.value })} /></div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="contract-warehouse">Kho áp dụng</label><select id="contract-warehouse" className="form-input" value={contractForm.warehouse_id || ''} onChange={(e) => setContractForm({ ...contractForm, warehouse_id: e.target.value })}><option value="">Tất cả kho</option>{warehouses.map((warehouse) => <option key={warehouse.warehouse_id} value={warehouse.warehouse_id}>{warehouse.warehouse_name || warehouse.warehouse_code}</option>)}</select></div>
            <div className="form-group"><label htmlFor="contract-status">Trạng thái</label><select id="contract-status" className="form-input" value={contractForm.status || 'DRAFT'} onChange={(e) => setContractForm({ ...contractForm, status: e.target.value })}>{['DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'TERMINATED'].map((status) => <option key={status}>{status}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="contract-start">Ngày bắt đầu *</label><input id="contract-start" type="date" className="form-input" value={contractForm.start_date || ''} onChange={(e) => setContractForm({ ...contractForm, start_date: e.target.value })} /></div>
            <div className="form-group"><label htmlFor="contract-end">Ngày kết thúc</label><input id="contract-end" type="date" className="form-input" value={contractForm.end_date || ''} onChange={(e) => setContractForm({ ...contractForm, end_date: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label htmlFor="billing-cycle">Chu kỳ tính phí</label><select id="billing-cycle" className="form-input" value={contractForm.billing_cycle || 'MONTHLY'} onChange={(e) => setContractForm({ ...contractForm, billing_cycle: e.target.value })}><option value="MONTHLY">Hàng tháng</option><option value="WEEKLY">Hàng tuần</option><option value="PER_EVENT">Theo phát sinh</option></select></div>
            <div className="form-group"><label htmlFor="contract-terms">Hạn thanh toán</label><input id="contract-terms" type="number" min="0" max="365" className="form-input" value={contractForm.payment_terms_days ?? 30} onChange={(e) => setContractForm({ ...contractForm, payment_terms_days: e.target.value })} /></div>
          </div>
          <div className="form-group"><label htmlFor="contract-notes">Điều khoản/Ghi chú</label><textarea id="contract-notes" className="form-input" rows="4" value={contractForm.notes || ''} onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })} /></div>
        </Modal>
      )}
    </div>
  );
}
