import { useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusTag from '../components/StatusTag.jsx';
import usePagedList from '../hooks/usePagedList.js';
import { formatDate, formatDateTime, formatNumber } from '../utils/format.js';

const STATUS_FILTERS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'OPEN', label: 'Đang mở' },
  { value: 'PARTIAL', label: 'Nhận một phần' },
  { value: 'RECEIVED', label: 'Đã nhận' },
  { value: 'CLOSED', label: 'Đã đóng' },
];

function Progress({ ordered, received }) {
  const pct = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;
  return (
    <div className="progress" title={`${received}/${ordered}`}>
      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <span className="mono">{pct}%</span>
    </div>
  );
}

export default function Inbound() {
  const [status, setStatus] = useState('');
  const list = usePagedList('/inbound', 'purchase_orders', { status });

  const columns = [
    { key: 'po_number', label: 'Số phiếu nhập', mono: true },
    { key: 'status', label: 'Trạng thái', render: (r) => <StatusTag status={r.status} /> },
    { key: 'expected_date', label: 'Dự kiến về', render: (r) => formatDate(r.expected_date) },
    { key: 'received_at', label: 'Đã nhận lúc', render: (r) => formatDateTime(r.received_at) },
    { key: 'warehouse_code', label: 'Kho', mono: true },
    { key: 'line_count', label: 'Số dòng', align: 'right', render: (r) => formatNumber(r.line_count) },
    {
      key: 'quantity',
      label: 'Đặt / đã nhận',
      align: 'right',
      render: (r) => (
        <span className="mono">
          {formatNumber(r.quantity_ordered)} / {formatNumber(r.quantity_received)}
        </span>
      ),
    },
    {
      key: 'progress',
      label: 'Tiến độ',
      render: (r) => <Progress ordered={r.quantity_ordered} received={r.quantity_received} />,
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Hàng nhập</h1>
        <select
          className="form-input filter-input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Lọc theo trạng thái"
        >
          {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      <p className="page-note">
        Chỉ hiển thị phiếu nhập đã được kho gán cho công ty bạn. Nếu thiếu một
        lô hàng bạn đã gửi tới, hãy liên hệ kho để gán chủ hàng cho phiếu đó.
      </p>
      {list.error && <div className="alert alert-danger" role="alert">{list.error}</div>}
      <div className="card">
        <DataTable
          columns={columns}
          rows={list.rows}
          rowKey={(r) => r.po_number}
          loading={list.loading}
          empty="Chưa có phiếu nhập nào."
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
