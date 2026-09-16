import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { api } from '../api.js';
import { useWarehouse } from '../warehouse.jsx';

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateValue}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

function ExpiryBadge({ expiryDate }) {
  const days = daysUntil(expiryDate);
  const expired = days < 0;
  return (
    <span className={`expiry-badge ${expired ? 'expiry-badge-danger' : 'expiry-badge-warning'}`}>
      {expired ? `Quá hạn ${Math.abs(days)} ngày` : days === 0 ? 'Hết hạn hôm nay' : `Còn ${days} ngày`}
    </span>
  );
}

export default function Expiry() {
  const { warehouseId, warehouse } = useWarehouse();
  const [near, setNear] = useState([]);
  const [expired, setExpired] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [extendDate, setExtendDate] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    setNotice(null);
    try {
      const [nearResponse, expiredResponse] = await Promise.all([
        api.get(`/expiry/near?warehouse_id=${warehouseId}&days=14`),
        api.get(`/expiry/expired?warehouse_id=${warehouseId}`),
      ]);
      if (!nearResponse?.ok || !expiredResponse?.ok) {
        const failed = !nearResponse?.ok ? nearResponse : expiredResponse;
        const body = await failed?.json().catch(() => ({}));
        throw new Error(body?.error || 'Không thể tải dữ liệu hạn sử dụng');
      }
      const [nearData, expiredData] = await Promise.all([
        nearResponse.json(),
        expiredResponse.json(),
      ]);
      setNear(nearData.near_expiry || []);
      setExpired(expiredData.expired || []);
      setSelected(new Set());
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const rows = useMemo(() => [
    ...expired.map((row) => ({ ...row, expiryState: 'expired' })),
    ...near.map((row) => ({ ...row, expiryState: 'near' })),
  ], [expired, near]);
  const selectedIds = useMemo(
    () => rows.filter((row) => selected.has(row.pallet_id)).map((row) => row.pallet_id),
    [rows, selected],
  );
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggleSelect(palletId) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(palletId)) next.delete(palletId);
      else next.add(palletId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.pallet_id)));
  }

  async function executeAction() {
    const action = confirmAction;
    setConfirmAction(null);
    setLoading(true);
    setNotice(null);
    try {
      let response;
      if (action === 'dispose') {
        response = await api.post('/expiry/dispose', { pallet_ids: selectedIds });
      } else if (action === 'policy') {
        response = await api.post('/expiry/dispose', { warehouse_id: warehouseId });
      } else if (action === 'extend') {
        response = await api.post('/expiry/extend', {
          pallet_ids: selectedIds,
          expiry_date: extendDate,
        });
      }
      if (!response?.ok) {
        const body = await response?.json().catch(() => ({}));
        throw new Error(body?.error || 'Thao tác không thành công');
      }
      const body = await response.json();
      setNotice({ type: 'success', message: body.message || 'Đã cập nhật' });
      setSelected(new Set());
      setExtendDate('');
      await load();
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  }

  function requestExtend() {
    if (!selected.size) {
      setNotice({ type: 'error', message: 'Chọn ít nhất một pallet để gia hạn.' });
      return;
    }
    if (!extendDate) {
      setNotice({ type: 'error', message: 'Chọn ngày hết hạn mới.' });
      return;
    }
    setConfirmAction('extend');
  }

  return (
    <div className="expiry-page">
      <PageHeader title="Quản lý hạn sử dụng">
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? 'Đang tải…' : 'Làm mới'}
        </button>
        <button className="btn btn-danger" onClick={() => setConfirmAction('policy')} disabled={loading || !warehouseId}>
          Chạy chính sách xử lý
        </button>
      </PageHeader>

      {!warehouseId ? (
        <div className="expiry-empty">Chọn kho ở thanh điều hướng để xem dữ liệu.</div>
      ) : (
        <>
          <div className="expiry-summary" aria-label="Tổng quan hạn sử dụng">
            <div className="expiry-stat">
              <span>Kho đang xem</span>
              <strong>{warehouse?.warehouse_code || `#${warehouseId}`}</strong>
            </div>
            <div className="expiry-stat expiry-stat-warning">
              <span>Sắp hết hạn (14 ngày)</span>
              <strong>{near.length}</strong>
            </div>
            <div className="expiry-stat expiry-stat-danger">
              <span>Đã quá hạn</span>
              <strong>{expired.length}</strong>
            </div>
            <div className="expiry-stat">
              <span>Đang chọn</span>
              <strong>{selected.size}</strong>
            </div>
          </div>

          {notice && (
            <div className={`expiry-notice expiry-notice-${notice.type}`} role="status">
              {notice.message}
            </div>
          )}

          <div className="expiry-toolbar">
            <div>
              <strong>{selected.size ? `${selected.size} pallet đã chọn` : 'Chọn pallet để thao tác hàng loạt'}</strong>
              <span>Gia hạn đồng bộ ngày trên pallet và tồn kho.</span>
            </div>
            <label className="expiry-date-field">
              <span>Ngày hết hạn mới</span>
              <input
                className="form-input"
                type="date"
                value={extendDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setExtendDate(event.target.value)}
              />
            </label>
            <button className="btn" onClick={requestExtend} disabled={loading || !selected.size}>
              Gia hạn đã chọn
            </button>
            <button
              className="btn btn-danger"
              onClick={() => setConfirmAction('dispose')}
              disabled={loading || !selected.size}
            >
              Tiêu hủy đã chọn
            </button>
          </div>

          <div className="expiry-table-card">
            <div className="expiry-table-heading">
              <div>
                <h2>Pallet cần xử lý</h2>
                <p>FEFO ưu tiên ngày gần nhất; hàng quá hạn không được cấp phát.</p>
              </div>
              <span>{rows.length} pallet</span>
            </div>
            {rows.length === 0 && !loading ? (
              <div className="expiry-empty">Không có pallet sắp hết hạn hoặc quá hạn.</div>
            ) : (
              <div className="expiry-table-scroll">
                <table className="data-table expiry-table">
                  <thead>
                    <tr>
                      <th className="expiry-check-cell">
                        <input
                          type="checkbox"
                          aria-label="Chọn tất cả pallet"
                          checked={allSelected}
                          onChange={toggleAll}
                        />
                      </th>
                      <th>Pallet</th>
                      <th>SKU</th>
                      <th>Bin</th>
                      <th>SL</th>
                      <th>Ngày hết hạn</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.pallet_id} className={selected.has(row.pallet_id) ? 'selected' : ''}>
                        <td className="expiry-check-cell">
                          <input
                            type="checkbox"
                            aria-label={`Chọn ${row.pallet_code || row.pallet_id}`}
                            checked={selected.has(row.pallet_id)}
                            onChange={() => toggleSelect(row.pallet_id)}
                          />
                        </td>
                        <td className="mono">{row.pallet_code || `#${row.pallet_id}`}</td>
                        <td className="mono">{row.sku || '—'}</td>
                        <td className="mono">{row.bin_id || '—'}</td>
                        <td>{row.quantity}</td>
                        <td className="mono">{row.expiry_date}</td>
                        <td><ExpiryBadge expiryDate={row.expiry_date} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {confirmAction && (
        <Modal
          title={
            confirmAction === 'dispose'
              ? 'Xác nhận tiêu hủy'
              : confirmAction === 'extend'
                ? 'Xác nhận gia hạn'
                : 'Chạy chính sách hết hạn'
          }
          onClose={() => setConfirmAction(null)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmAction(null)}>Hủy</button>
              <button
                className={confirmAction === 'extend' ? 'btn btn-primary' : 'btn btn-danger'}
                onClick={executeAction}
              >
                {confirmAction === 'extend' ? 'Gia hạn' : 'Xác nhận'}
              </button>
            </>
          }
        >
          {confirmAction === 'dispose' && (
            <p>Tiêu hủy vĩnh viễn {selected.size} pallet đã chọn và ghi nhận phí tiêu hủy nếu có. Không thể hoàn tác.</p>
          )}
          {confirmAction === 'extend' && (
            <p>Đặt ngày hết hạn mới thành <strong>{extendDate}</strong> cho {selected.size} pallet và tồn kho liên quan.</p>
          )}
          {confirmAction === 'policy' && (
            <p>Chạy quy trình cách ly và tự động tiêu hủy theo cấu hình cho kho <strong>{warehouse?.warehouse_code || warehouseId}</strong>.</p>
          )}
        </Modal>
      )}
    </div>
  );
}

