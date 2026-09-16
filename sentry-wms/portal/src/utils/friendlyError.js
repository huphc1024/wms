/**
 * V-021: map backend error responses to user-facing Vietnamese strings.
 *
 * The portal is customer-facing, so the mapping is tighter than admin's:
 * anything unrecognised collapses to a generic message rather than
 * echoing a backend string. Server errors on portal routes can carry
 * operator vocabulary (bin, zone, allocation) that means nothing to a
 * customer and hints at internal structure.
 */

const KNOWN = {
  validation_error: 'Một hoặc nhiều trường không hợp lệ.',
  unsupported_media_type: 'Định dạng yêu cầu không được hỗ trợ.',
  'Invalid username or password': 'Sai tên đăng nhập hoặc mật khẩu.',
  Unauthorized: 'Bạn cần đăng nhập để tiếp tục.',
  Forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  'Permission denied': 'Tài khoản của bạn chưa được cấp quyền cho mục này.',
  'Token expired': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  'Token invalidated by password change': 'Mật khẩu đã thay đổi. Vui lòng đăng nhập lại.',
  'CSRF token missing or invalid': 'Phiên làm việc lệch. Hãy làm mới trang và thử lại.',
  password_change_required: 'Bạn phải đổi mật khẩu trước khi tiếp tục.',
  'Current password is incorrect': 'Mật khẩu hiện tại không đúng.',
  'Account not found': 'Không tìm thấy tài khoản.',
  "Password cannot be 'admin'": 'Mật khẩu không được là "admin".',
  'Password must be at least 8 characters': 'Mật khẩu phải có ít nhất 8 ký tự.',
  'Password must contain at least one letter': 'Mật khẩu phải có ít nhất một chữ cái.',
  'Password must contain at least one digit': 'Mật khẩu phải có ít nhất một chữ số.',
  'Order not found': 'Không tìm thấy đơn hàng.',
  'Invoice not found': 'Không tìm thấy hóa đơn.',
  'Warehouse not found': 'Không tìm thấy kho phù hợp.',
  'Customer not found': 'Không tìm thấy khách hàng.',
  'No stock on hand to ship from': 'Bạn chưa có tồn kho nào để tạo yêu cầu xuất.',
  'warehouse_code is required': 'Bạn đang gửi hàng ở nhiều kho — hãy chọn kho xuất.',
};

export const GENERIC_ERROR = 'Đã xảy ra lỗi. Vui lòng thử lại.';

export function friendlyError(payload, fallback = GENERIC_ERROR) {
  if (!payload || typeof payload !== 'object') return fallback;
  const code = payload.error;
  if (code === 'Unknown sku') {
    // The handler echoes the offending SKU; it came from this user's own
    // input, so quoting it back is safe and far more useful than "invalid".
    return payload.sku
      ? `Mã hàng không thuộc về bạn hoặc không tồn tại: ${payload.sku}`
      : 'Mã hàng không thuộc về bạn hoặc không tồn tại.';
  }
  if (code && Object.prototype.hasOwnProperty.call(KNOWN, code)) return KNOWN[code];
  return fallback;
}

export async function friendlyErrorFromResponse(res, fallback = GENERIC_ERROR) {
  if (!res) return fallback;
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return friendlyError(body, fallback);
}
