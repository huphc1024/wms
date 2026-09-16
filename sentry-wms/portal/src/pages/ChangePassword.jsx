import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { friendlyErrorFromResponse } from '../utils/friendlyError.js';

export default function ChangePassword() {
  const { account, refresh } = useAuth();
  const navigate = useNavigate();
  const forced = Boolean(account?.must_change_password);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('Mật khẩu mới và ô xác nhận không khớp.');
      return;
    }
    setBusy(true);
    const res = await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    setBusy(false);
    if (!res || !res.ok) {
      setError(await friendlyErrorFromResponse(res, 'Không đổi được mật khẩu.'));
      setCurrentPassword('');
      return;
    }
    setDone(true);
    // The password change bumps password_changed_at, which invalidates
    // every token minted at or before that second -- including this
    // session's. Re-reading /auth/me tells us whether the cookie survived:
    // if it did not, send the user to the login screen instead of leaving
    // them on a page whose next request would 401.
    const identity = await refresh();
    if (!identity) {
      navigate('/login', { replace: true });
      return;
    }
    if (forced) navigate('/', { replace: true });
  }

  return (
    <div className="page page-narrow">
      <h1>Đổi mật khẩu</h1>
      {forced && (
        <div className="alert alert-warning" role="alert">
          Bạn phải đổi mật khẩu trước khi xem được dữ liệu của mình.
        </div>
      )}
      {done && !forced && (
        <div className="alert alert-success" role="status">Đã đổi mật khẩu.</div>
      )}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <form className="card form-card" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="cur">Mật khẩu hiện tại</label>
          <input
            id="cur"
            className="form-input"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="new">Mật khẩu mới</label>
          <input
            id="new"
            className="form-input"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <span className="form-hint">
            Tối thiểu 8 ký tự, có ít nhất một chữ cái và một chữ số.
          </span>
        </div>
        <div className="form-group">
          <label htmlFor="confirm">Xác nhận mật khẩu mới</label>
          <input
            id="confirm"
            className="form-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Đổi mật khẩu'}
        </button>
      </form>
    </div>
  );
}
