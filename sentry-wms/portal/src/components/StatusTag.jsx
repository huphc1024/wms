/**
 * Status pill. Vietnamese labels for the statuses a customer can
 * actually see on portal payloads: sales_orders.status (constants.py
 * SO_*), purchase_orders.status (PO_*) and billing_invoices.status.
 *
 * An unmapped status renders verbatim in the neutral tone rather than
 * being hidden -- an operator adding a status should show up as an
 * unstyled label, not as a blank cell.
 */
const TONES = {
  // Sales orders
  OPEN: 'info',
  WAITING_STOCK: 'warning',
  PICKED: 'info',
  PACKED: 'info',
  SHIPPED: 'success',
  CANCELLED: 'muted',
  REFUNDED: 'muted',
  // Purchase orders
  PARTIAL: 'warning',
  RECEIVED: 'success',
  CLOSED: 'muted',
  ARCHIVED: 'muted',
  // Invoices
  SENT: 'info',
  PAID: 'success',
  // Sales-order lines (schema.sql: PENDING / PICKED / PACKED / SHIPPED)
  PENDING: 'muted',
};

const LABELS = {
  OPEN: 'Đang mở',
  WAITING_STOCK: 'Chờ hàng',
  PICKED: 'Đã lấy hàng',
  PACKED: 'Đã đóng gói',
  SHIPPED: 'Đã xuất',
  CANCELLED: 'Đã hủy',
  REFUNDED: 'Đã hoàn tiền',
  PARTIAL: 'Nhận một phần',
  RECEIVED: 'Đã nhận',
  CLOSED: 'Đã đóng',
  ARCHIVED: 'Lưu trữ',
  SENT: 'Đã gửi',
  PAID: 'Đã thanh toán',
  PENDING: 'Chờ xử lý',
};

export function statusLabel(status) {
  if (!status) return '—';
  return LABELS[status] || status;
}

export default function StatusTag({ status }) {
  if (!status) return <span className="text-muted">—</span>;
  return (
    <span className={`tag tag-${TONES[status] || 'muted'}`}>{statusLabel(status)}</span>
  );
}
