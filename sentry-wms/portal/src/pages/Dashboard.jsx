import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth, hasFeature } from '../auth.jsx';
import StatusTag from '../components/StatusTag.jsx';
import { formatDate, formatMoney, formatNumber } from '../utils/format.js';

const OPEN_SO_STATUSES = new Set(['OPEN', 'WAITING_STOCK', 'PICKED', 'PACKED']);

/**
 * Landing page. Every tile is driven by the same list endpoints the
 * detail pages use, asked for a short page: the envelope's `total` gives
 * the count and the rows give the "recent" strip, so no dashboard-only
 * endpoint had to be added to the portal API.
 *
 * A tile whose feature is not granted is not rendered at all. A 403 that
 * slips through anyway (grant revoked between /auth/me and this fetch)
 * leaves the tile empty rather than raising -- the nav is a convenience,
 * the server is the gate.
 */
export default function Dashboard() {
  const { account } = useAuth();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      async function fetchList(path, key, params) {
        const res = await api.get(`${path}${qs(params)}`);
        if (!res || !res.ok) return { total: 0, rows: [], denied: Boolean(res) };
        const data = await res.json();
        return { total: data.total || 0, rows: data[key] || [], denied: false };
      }

      const [inventory, orders, inbound, invoices] = await Promise.all([
        hasFeature(account, 'inventory')
          ? fetchList('/inventory', 'items', { page_size: 5 })
          : null,
        hasFeature(account, 'orders')
          ? fetchList('/orders', 'orders', { page_size: 5 })
          : null,
        hasFeature(account, 'inbound')
          ? fetchList('/inbound', 'purchase_orders', { page_size: 5 })
          : null,
        hasFeature(account, 'invoices')
          ? fetchList('/invoices', 'invoices', { page_size: 3 })
          : null,
      ]);
      if (cancelled) return;
      setState({ loading: false, inventory, orders, inbound, invoices });
    })();
    return () => { cancelled = true; };
  }, [account]);

  const { loading, inventory, orders, inbound, invoices } = state;
  const noFeatures = (account?.features?.length || 0) === 0;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Tổng quan</h1>
      </div>

      {noFeatures && (
        <div className="alert alert-warning" role="status">
          Tài khoản của bạn chưa được cấp quyền xem dữ liệu nào. Liên hệ quản lý
          kho để được mở quyền tồn kho, đơn xuất, hàng nhập hoặc hóa đơn.
        </div>
      )}

      <div className="stat-grid">
        {inventory && (
          <Link className="stat" to="/inventory">
            <span>Dòng tồn kho</span>
            <strong>{loading ? '…' : formatNumber(inventory.total)}</strong>
            <em>theo mã hàng / lô</em>
          </Link>
        )}
        {orders && (
          <Link className="stat" to="/orders">
            <span>Đơn xuất đang xử lý</span>
            <strong>
              {loading ? '…' : formatNumber(orders.rows.filter((o) => OPEN_SO_STATUSES.has(o.status)).length)}
            </strong>
            <em>trong {formatNumber(orders.total)} đơn gần nhất</em>
          </Link>
        )}
        {inbound && (
          <Link className="stat" to="/inbound">
            <span>Phiếu nhập</span>
            <strong>{loading ? '…' : formatNumber(inbound.total)}</strong>
            <em>đã gán cho công ty bạn</em>
          </Link>
        )}
        {invoices && (
          <Link className="stat" to="/invoices">
            <span>Hóa đơn đã phát hành</span>
            <strong>{loading ? '…' : formatNumber(invoices.total)}</strong>
            <em>xem chi tiết phí</em>
          </Link>
        )}
      </div>

      <div className="dash-columns">
        {orders && (
          <section className="card">
            <h2 className="card-title">Đơn xuất gần nhất</h2>
            {loading && <div className="card-note">Đang tải…</div>}
            {!loading && orders.rows.length === 0 && (
              <div className="card-note">Chưa có đơn xuất nào.</div>
            )}
            <ul className="mini-list">
              {orders.rows.map((o) => (
                <li key={o.so_number}>
                  <Link className="mono" to={`/orders/${encodeURIComponent(o.so_number)}`}>
                    {o.so_number}
                  </Link>
                  <StatusTag status={o.status} />
                  <span className="text-muted">{formatDate(o.order_date)}</span>
                </li>
              ))}
            </ul>
            <Link className="btn btn-sm" to="/orders/new">Tạo yêu cầu xuất</Link>
          </section>
        )}

        {inbound && (
          <section className="card">
            <h2 className="card-title">Hàng nhập gần nhất</h2>
            {loading && <div className="card-note">Đang tải…</div>}
            {!loading && inbound.rows.length === 0 && (
              <div className="card-note">Chưa có phiếu nhập nào.</div>
            )}
            <ul className="mini-list">
              {inbound.rows.map((p) => (
                <li key={p.po_number}>
                  <span className="mono">{p.po_number}</span>
                  <StatusTag status={p.status} />
                  <span className="text-muted">
                    {formatNumber(p.quantity_received)}/{formatNumber(p.quantity_ordered)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {invoices && (
          <section className="card">
            <h2 className="card-title">Hóa đơn mới nhất</h2>
            {loading && <div className="card-note">Đang tải…</div>}
            {!loading && invoices.rows.length === 0 && (
              <div className="card-note">Chưa có hóa đơn nào.</div>
            )}
            <ul className="mini-list">
              {invoices.rows.map((inv) => (
                <li key={inv.invoice_number}>
                  <Link className="mono" to={`/invoices/${encodeURIComponent(inv.invoice_number)}`}>
                    {inv.invoice_number}
                  </Link>
                  <StatusTag status={inv.status} />
                  <span className="mono">{formatMoney(inv.total_amount, inv.currency)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
