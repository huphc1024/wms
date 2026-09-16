import { useNavigate } from 'react-router-dom';
import DataTable from '../components/DataTable.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusTag from '../components/StatusTag.jsx';
import usePagedList from '../hooks/usePagedList.js';
import { formatDate, formatMoney } from '../utils/format.js';

export default function Invoices() {
  const navigate = useNavigate();
  const list = usePagedList('/invoices', 'invoices');

  const columns = [
    { key: 'invoice_number', label: 'Số hóa đơn', mono: true },
    {
      key: 'period',
      label: 'Kỳ tính phí',
      render: (r) => `${formatDate(r.period_start)} – ${formatDate(r.period_end)}`,
    },
    { key: 'issued_at', label: 'Ngày phát hành', render: (r) => formatDate(r.issued_at) },
    { key: 'due_date', label: 'Hạn thanh toán', render: (r) => formatDate(r.due_date) },
    {
      key: 'total_amount',
      label: 'Tổng tiền',
      align: 'right',
      render: (r) => <strong className="mono">{formatMoney(r.total_amount, r.currency)}</strong>,
    },
    { key: 'status', label: 'Trạng thái', render: (r) => <StatusTag status={r.status} /> },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h1>Hóa đơn</h1>
      </div>
      <p className="page-note">
        Chỉ hiển thị hóa đơn đã phát hành. Bản nháp kho đang soạn sẽ không xuất
        hiện ở đây.
      </p>
      {list.error && <div className="alert alert-danger" role="alert">{list.error}</div>}
      <div className="card">
        <DataTable
          columns={columns}
          rows={list.rows}
          rowKey={(r) => r.invoice_number}
          loading={list.loading}
          empty="Chưa có hóa đơn nào."
          onRowClick={(r) => navigate(`/invoices/${encodeURIComponent(r.invoice_number)}`)}
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
