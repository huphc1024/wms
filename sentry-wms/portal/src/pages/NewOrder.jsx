import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useAuth, hasFeature } from '../auth.jsx';
import { friendlyError } from '../utils/friendlyError.js';
import { formatNumber } from '../utils/format.js';

const MAX_LINES = 500;

function emptyLine() {
  return { sku: '', quantity: '' };
}

/**
 * Create an outbound request.
 *
 * The stock probe is a convenience layer only: it pre-fills the SKU
 * suggestions and the warehouse choices from what this customer actually
 * holds. Every one of those values is re-validated server-side against
 * the caller's ownership scope, and the account may hold `orders`
 * without `inventory` -- in which case the probe 403s, the suggestions
 * are simply absent, and the form still works off free text.
 */
export default function NewOrder() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const [lines, setLines] = useState([emptyLine()]);
  const [warehouseCode, setWarehouseCode] = useState('');
  const [warehouseChoices, setWarehouseChoices] = useState([]);
  const [skuOptions, setSkuOptions] = useState([]);
  const [form, setForm] = useState({
    reference: '', ship_to_name: '', ship_address: '', ship_method: '', memo: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasFeature(account, 'inventory')) return undefined;
    let cancelled = false;
    (async () => {
      const res = await api.get(`/inventory${qs({ page_size: 200 })}`);
      if (cancelled || !res || !res.ok) return;
      const data = await res.json();
      const bySku = new Map();
      const warehouses = new Set();
      (data.items || []).forEach((r) => {
        warehouses.add(r.warehouse_code);
        const prev = bySku.get(r.sku) || { sku: r.sku, item_name: r.item_name, available: 0 };
        prev.available += r.quantity_available;
        bySku.set(r.sku, prev);
      });
      setSkuOptions([...bySku.values()]);
      setWarehouseChoices([...warehouses].sort());
    })();
    return () => { cancelled = true; };
  }, [account]);

  function setLine(index, patch) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => (prev.length >= MAX_LINES ? prev : [...prev, emptyLine()]));
  }

  function removeLine(index) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function validate(payloadLines) {
    if (payloadLines.length === 0) return 'Cần ít nhất một dòng hàng.';
    const seen = new Set();
    for (const line of payloadLines) {
      if (!line.sku) return 'Mỗi dòng phải có mã hàng.';
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        return `Số lượng của ${line.sku} phải là số nguyên lớn hơn 0.`;
      }
      const key = line.sku.toUpperCase();
      if (seen.has(key)) return `Mã hàng bị trùng dòng: ${line.sku}`;
      seen.add(key);
    }
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const payloadLines = lines
      .map((l) => ({ sku: l.sku.trim(), quantity: Number(l.quantity) }))
      .filter((l) => l.sku !== '' || l.quantity);
    const validationError = validate(payloadLines);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    const res = await api.post('/orders', {
      lines: payloadLines,
      warehouse_code: warehouseCode || undefined,
      reference: form.reference || undefined,
      ship_to_name: form.ship_to_name || undefined,
      ship_address: form.ship_address || undefined,
      ship_method: form.ship_method || undefined,
      memo: form.memo || undefined,
    });
    setBusy(false);
    if (!res) return;
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      // The multi-warehouse 400 carries the valid codes; surface them as
      // a picker instead of making the customer guess a warehouse code.
      if (body && Array.isArray(body.choices) && body.choices.length > 0) {
        setWarehouseChoices(body.choices);
      }
      setError(friendlyError(body, 'Không tạo được yêu cầu xuất.'));
      return;
    }
    const created = await res.json();
    navigate(`/orders/${encodeURIComponent(created.so_number)}`, { replace: true });
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Tạo yêu cầu xuất</h1>
        <Link className="btn btn-sm" to="/orders">← Danh sách đơn xuất</Link>
      </div>
      <p className="page-note">
        Yêu cầu được gửi vào hàng đợi của kho ở trạng thái <strong>Đang mở</strong>.
        Kho sẽ xác nhận và xử lý; số đơn do hệ thống sinh.
      </p>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <form className="card form-card" onSubmit={handleSubmit}>
        <h2 className="card-title">Hàng cần xuất</h2>
        <div className="table-wrap">
          <table className="data-table line-editor">
            <thead>
              <tr>
                <th>Mã hàng</th>
                <th className="align-right">Số lượng</th>
                <th aria-label="Xóa dòng" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const match = skuOptions.find(
                  (o) => o.sku.toUpperCase() === line.sku.trim().toUpperCase(),
                );
                return (
                  <tr key={index}>
                    <td>
                      <input
                        className="form-input mono"
                        list="portal-sku-options"
                        maxLength={50}
                        value={line.sku}
                        onChange={(e) => setLine(index, { sku: e.target.value })}
                        aria-label={`Mã hàng dòng ${index + 1}`}
                      />
                      {match && (
                        <span className="form-hint">
                          {match.item_name} — khả dụng {formatNumber(match.available)}
                        </span>
                      )}
                    </td>
                    <td className="align-right">
                      <input
                        className="form-input mono qty-input"
                        type="number"
                        min="1"
                        max="1000000"
                        step="1"
                        value={line.quantity}
                        onChange={(e) => setLine(index, { quantity: e.target.value })}
                        aria-label={`Số lượng dòng ${index + 1}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => removeLine(index)}
                        disabled={lines.length === 1}
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <datalist id="portal-sku-options">
          {skuOptions.map((o) => <option key={o.sku} value={o.sku}>{o.item_name}</option>)}
        </datalist>
        <div>
          <button type="button" className="btn btn-sm" onClick={addLine}>+ Thêm dòng</button>
        </div>

        <h2 className="card-title">Thông tin giao hàng</h2>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="wh">Kho xuất</label>
            {warehouseChoices.length > 0 ? (
              <select
                id="wh"
                className="form-input"
                value={warehouseCode}
                onChange={(e) => setWarehouseCode(e.target.value)}
              >
                <option value="">
                  {warehouseChoices.length === 1
                    ? `Mặc định (${warehouseChoices[0]})`
                    : '— Chọn kho —'}
                </option>
                {warehouseChoices.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input
                id="wh"
                className="form-input mono"
                maxLength={20}
                value={warehouseCode}
                onChange={(e) => setWarehouseCode(e.target.value)}
                placeholder="Để trống nếu chỉ gửi hàng ở một kho"
              />
            )}
          </div>
          <div className="form-group">
            <label htmlFor="ref">Mã tham chiếu của bạn</label>
            <input
              id="ref"
              className="form-input"
              maxLength={64}
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="shipTo">Người / đơn vị nhận</label>
            <input
              id="shipTo"
              className="form-input"
              maxLength={200}
              value={form.ship_to_name}
              onChange={(e) => setForm({ ...form, ship_to_name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="method">Hình thức giao</label>
            <input
              id="method"
              className="form-input"
              maxLength={50}
              value={form.ship_method}
              onChange={(e) => setForm({ ...form, ship_method: e.target.value })}
            />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="addr">Địa chỉ giao</label>
          <textarea
            id="addr"
            className="form-input"
            rows={2}
            maxLength={500}
            value={form.ship_address}
            onChange={(e) => setForm({ ...form, ship_address: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label htmlFor="memo">Ghi chú cho kho</label>
          <textarea
            id="memo"
            className="form-input"
            rows={2}
            maxLength={500}
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Đang gửi…' : 'Gửi yêu cầu xuất'}
        </button>
      </form>
    </div>
  );
}
