import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import DataTable from '../components/DataTable.jsx';
import StatusTag from '../components/StatusTag.jsx';
import { friendlyErrorFromResponse } from '../utils/friendlyError.js';
import { formatDate, formatNumber } from '../utils/format.js';

export default function OrderDetail() {
  const { soNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await api.get(`/orders/${encodeURIComponent(soNumber)}`);
      if (cancelled || !res) return;
      if (!res.ok) {
        // 404 here covers both "no such order" and "another customer's
        // order" -- the API keeps the two indistinguishable on purpose,
        // so the UI must not speculate about which one happened.
        setError(await friendlyErrorFromResponse(res, 'Không tìm thấy đơn hàng.'));
        setLoading(false);
        return;
      }
      setOrder(await res.json());
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [soNumber]);

  const columns = [
    { key: 'line_number', label: '#', align: 'right' },
    { key: 'sku', label: 'Mã hàng', mono: true },
    { key: 'item_name', label: 'Tên hàng' },
    { key: 'quantity_ordered', label: 'Đặt', align: 'right', render: (r) => formatNumber(r.quantity_ordered) },
    { key: 'quantity_picked', label: 'Đã lấy', align: 'right', render: (r) => formatNumber(r.quantity_picked) },
    { key: 'quantity_shipped', label: 'Đã xuất', align: 'right', render: (r) => formatNumber(r.quantity_shipped) },
    { key: 'status', label: 'Trạng thái', render: (r) => <StatusTag status={r.status} /> },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="mono">{soNumber}</h1>
        <Link className="btn btn-sm" to="/orders">← Danh sách đơn xuất</Link>
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {loading && <div className="card-note">Đang tải…</div>}
      {order && (
        <>
          <div className="card detail-grid">
            <div><span>Trạng thái</span><StatusTag status={order.status} /></div>
            <div><span>Ngày đặt</span><strong>{formatDate(order.order_date)}</strong></div>
            <div><span>Cần xuất trước</span><strong>{formatDate(order.ship_by_date)}</strong></div>
            <div><span>Kho</span><strong className="mono">{order.warehouse_code}</strong></div>
            <div><span>Hình thức giao</span><strong>{order.ship_method || '—'}</strong></div>
            <div><span>Nguồn đơn</span><strong>{order.order_origin || '—'}</strong></div>
            <div className="detail-wide"><span>Địa chỉ giao</span><strong>{order.ship_address || '—'}</strong></div>
            {order.memo && <div className="detail-wide"><span>Ghi chú</span><strong>{order.memo}</strong></div>}
          </div>
          <div className="card">
            <h2 className="card-title">Chi tiết hàng</h2>
            <DataTable
              columns={columns}
              rows={order.lines}
              rowKey={(r) => r.line_number}
              empty="Đơn chưa có dòng hàng nào."
            />
          </div>
        </>
      )}
    </div>
  );
}
