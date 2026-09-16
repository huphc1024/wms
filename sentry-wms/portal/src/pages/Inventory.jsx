import { useEffect, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import Pagination from '../components/Pagination.jsx';
import usePagedList from '../hooks/usePagedList.js';
import { formatDate, formatNumber, daysUntil } from '../utils/format.js';

const EXPIRY_WARNING_DAYS = 30;

function ExpiryCell({ date }) {
  if (!date) return <span className="text-muted">—</span>;
  const days = daysUntil(date);
  let tone = '';
  if (days !== null && days < 0) tone = ' tag tag-danger';
  else if (days !== null && days <= EXPIRY_WARNING_DAYS) tone = ' tag tag-warning';
  return (
    <span className={`mono${tone}`}>
      {formatDate(date)}
      {days !== null && days < 0 && ' (đã hết hạn)'}
      {days !== null && days >= 0 && days <= EXPIRY_WARNING_DAYS && ` (còn ${days} ngày)`}
    </span>
  );
}

export default function Inventory() {
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  // Debounced so typing a SKU does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setApplied(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const list = usePagedList('/inventory', 'items', { search: applied });

  const columns = [
    { key: 'sku', label: 'Mã hàng', mono: true },
    { key: 'item_name', label: 'Tên hàng' },
    { key: 'lot_number', label: 'Lô', mono: true, render: (r) => r.lot_number || '—' },
    { key: 'expiry_date', label: 'Hạn dùng', render: (r) => <ExpiryCell date={r.expiry_date} /> },
    { key: 'warehouse_code', label: 'Kho', mono: true },
    { key: 'quantity_on_hand', label: 'Tồn', align: 'right', render: (r) => formatNumber(r.quantity_on_hand) },
    { key: 'quantity_allocated', label: 'Đã giữ', align: 'right', render: (r) => formatNumber(r.quantity_allocated) },
    { key: 'quantity_available', label: 'Khả dụng', align: 'right', render: (r) => <strong>{formatNumber(r.quantity_available)}</strong> },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Tồn kho</h1>
        <input
          className="form-input search-input"
          type="search"
          placeholder="Tìm mã hàng hoặc tên hàng"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Tìm tồn kho"
        />
      </div>
      <p className="page-note">
        Số lượng gộp theo mã hàng, lô và hạn dùng. <strong>Khả dụng</strong> = tồn
        trừ phần đã giữ cho các đơn xuất đang xử lý.
      </p>
      {list.error && <div className="alert alert-danger" role="alert">{list.error}</div>}
      <div className="card">
        <DataTable
          columns={columns}
          rows={list.rows}
          rowKey={(r) => `${r.sku}|${r.lot_number || ''}|${r.expiry_date || ''}|${r.warehouse_code}`}
          loading={list.loading}
          empty={applied ? 'Không tìm thấy mã hàng phù hợp.' : 'Chưa có tồn kho nào.'}
        />
        <Pagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onChange={list.setPage}
        />
      </div>
    </div>
  );
}
