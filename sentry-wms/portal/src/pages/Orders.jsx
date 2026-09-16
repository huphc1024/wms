import { Link, useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusTag from '../components/StatusTag.jsx';
import usePagedList from '../hooks/usePagedList.js';
import { formatDate, formatNumber } from '../utils/format.js';

export default function Orders() {
  const navigate = useNavigate();
  const list = usePagedList('/orders', 'orders');

  const columns = [
    { key: 'so_number', label: 'Số đơn', mono: true },
    { key: 'status', label: 'Trạng thái', render: (r) => <StatusTag status={r.status} /> },
    { key: 'order_date', label: 'Ngày đặt', render: (r) => formatDate(r.order_date) },
    { key: 'ship_by_date', label: 'Cần xuất trước', render: (r) => formatDate(r.ship_by_date) },
    { key: 'warehouse_code', label: 'Kho', mono: true },
    { key: 'line_count', label: 'Số dòng', align: 'right', render: (r) => formatNumber(r.line_count) },
    {
      key: 'quantity',
      label: 'Đặt / đã xuất',
      align: 'right',
      render: (r) => (
        <span className="mono">
          {formatNumber(r.quantity_ordered)} / {formatNumber(r.quantity_shipped)}
        </span>
      ),
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Đơn xuất</h1>
        <Link className="btn btn-primary" to="/orders/new">Tạo yêu cầu xuất</Link>
      </div>
      {list.error && <div className="alert alert-danger" role="alert">{list.error}</div>}
      <div className="card">
        <DataTable
          columns={columns}
          rows={list.rows}
          rowKey={(r) => r.so_number}
          loading={list.loading}
          empty="Chưa có đơn xuất nào."
          onRowClick={(r) => navigate(`/orders/${encodeURIComponent(r.so_number)}`)}
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
