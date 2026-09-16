import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import DataTable from '../components/DataTable.jsx';
import StatusTag from '../components/StatusTag.jsx';
import { friendlyErrorFromResponse } from '../utils/friendlyError.js';
import { formatDate, formatMoney, formatNumber } from '../utils/format.js';

export default function InvoiceDetail() {
  const { invoiceNumber } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await api.get(`/invoices/${encodeURIComponent(invoiceNumber)}`);
      if (cancelled || !res) return;
      if (!res.ok) {
        setError(await friendlyErrorFromResponse(res, 'Không tìm thấy hóa đơn.'));
        setLoading(false);
        return;
      }
      setInvoice(await res.json());
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [invoiceNumber]);

  const columns = [
    { key: 'description', label: 'Diễn giải' },
    { key: 'quantity', label: 'Số lượng', align: 'right', render: (r) => formatNumber(r.quantity) },
    {
      key: 'unit_price',
      label: 'Đơn giá',
      align: 'right',
      render: (r) => formatMoney(r.unit_price, invoice?.currency),
    },
    {
      key: 'amount',
      label: 'Thành tiền',
      align: 'right',
      render: (r) => <strong className="mono">{formatMoney(r.amount, invoice?.currency)}</strong>,
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="mono">{invoiceNumber}</h1>
        <Link className="btn btn-sm" to="/invoices">← Danh sách hóa đơn</Link>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {loading && <div className="card-note">Đang tải…</div>}
      {invoice && (
        <>
          <div className="card detail-grid">
            <div><span>Trạng thái</span><StatusTag status={invoice.status} /></div>
            <div>
              <span>Kỳ tính phí</span>
              <strong>{formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}</strong>
            </div>
            <div><span>Ngày phát hành</span><strong>{formatDate(invoice.issued_at)}</strong></div>
            <div><span>Hạn thanh toán</span><strong>{formatDate(invoice.due_date)}</strong></div>
            <div>
              <span>Tổng tiền</span>
              <strong className="mono">{formatMoney(invoice.total_amount, invoice.currency)}</strong>
            </div>
            {invoice.notes && (
              <div className="detail-wide"><span>Ghi chú</span><strong>{invoice.notes}</strong></div>
            )}
          </div>
          <div className="card">
            <h2 className="card-title">Chi tiết phí</h2>
            <DataTable
              columns={columns}
              rows={invoice.lines}
              rowKey={(r, i) => `${r.description}-${i}`}
              empty="Hóa đơn không có dòng chi tiết."
            />
          </div>
        </>
      )}
    </div>
  );
}
