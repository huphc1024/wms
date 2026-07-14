/**
 * V-021: map backend error responses to user-friendly strings.
 */

const KNOWN_ERROR_MESSAGES = {
  validation_error: 'One or more fields have invalid values.',
  unsupported_media_type: 'That request format is not supported.',
  'Invalid username or password': 'Wrong username or password.',
  'Account disabled or deleted': 'Your account is no longer active. Contact an admin.',
  'Token expired': 'Your session has expired. Please sign in again.',
  Unauthorized: 'You need to sign in to continue.',
  Forbidden: 'You do not have permission for that action.',
  'CSRF token missing or invalid': 'Your session is out of sync. Refresh the page and try again.',
  'Access denied for this warehouse': 'You do not have access to that warehouse.',
  'Current password is incorrect': 'Current password is incorrect.',
  'User not found': 'Account not found.',
  "Password cannot be 'admin'": "Password cannot be 'admin'.",
  'Password must be at least 8 characters': 'Password must be at least 8 characters.',
  'Password must contain at least one letter': 'Password must contain at least one letter.',
  'Password must contain at least one digit': 'Password must contain at least one digit.',
  password_change_required: 'You must change your password before continuing.',
};

const VI_MESSAGES = {
  'One or more fields have invalid values.': 'Một hoặc nhiều trường không hợp lệ.',
  'That request format is not supported.': 'Định dạng yêu cầu không được hỗ trợ.',
  'Wrong username or password.': 'Sai tên đăng nhập hoặc mật khẩu.',
  'Your account is no longer active. Contact an admin.':
    'Tài khoản đã ngưng. Liên hệ quản trị viên.',
  'Your session has expired. Please sign in again.':
    'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  'You need to sign in to continue.': 'Bạn cần đăng nhập để tiếp tục.',
  'You do not have permission for that action.': 'Bạn không có quyền thực hiện thao tác này.',
  'Your session is out of sync. Refresh the page and try again.':
    'Phiên làm việc lệch. Hãy làm mới trang và thử lại.',
  'You do not have access to that warehouse.': 'Bạn không có quyền truy cập kho đó.',
  'Current password is incorrect.': 'Mật khẩu hiện tại không đúng.',
  'Account not found.': 'Không tìm thấy tài khoản.',
  "Password cannot be 'admin'.": 'Mật khẩu không được là "admin".',
  'Password must be at least 8 characters.': 'Mật khẩu phải có ít nhất 8 ký tự.',
  'Password must contain at least one letter.': 'Mật khẩu phải có ít nhất một chữ cái.',
  'Password must contain at least one digit.': 'Mật khẩu phải có ít nhất một chữ số.',
  'You must change your password before continuing.':
    'Bạn phải đổi mật khẩu trước khi tiếp tục.',
  'Something went wrong. Please try again.': 'Đã xảy ra lỗi. Vui lòng thử lại.',
};

function localize(msg) {
  try {
    const locale = localStorage.getItem('sentry_admin_locale') || 'vi';
    if (locale === 'vi' && VI_MESSAGES[msg]) return VI_MESSAGES[msg];
  } catch { /* ignore */ }
  return msg;
}

export function friendlyError(payload, fallback = 'Something went wrong. Please try again.') {
  if (!payload || typeof payload !== 'object') return localize(fallback);
  const code = payload.error;
  if (code && Object.prototype.hasOwnProperty.call(KNOWN_ERROR_MESSAGES, code)) {
    return localize(KNOWN_ERROR_MESSAGES[code]);
  }
  return localize(fallback);
}

export async function friendlyErrorFromResponse(res, fallback) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return friendlyError(body, fallback);
}
