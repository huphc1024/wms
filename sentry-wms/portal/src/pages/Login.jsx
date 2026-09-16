import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { BRAND_NAME, PORTAL_NAME } from '../brand.js';
import { PortalLogo } from '../components/Layout.jsx';

export default function Login() {
  const { account, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (account) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      // The router guard sends accounts with must_change_password=true on
      // to /change-password; every provisioned login starts that way
      // (mig 088 defaults the flag to TRUE).
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <PortalLogo />
          <div>
            <strong>{BRAND_NAME}</strong>
            <span>{PORTAL_NAME}</span>
          </div>
        </div>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <div className="form-group">
          <label htmlFor="username">Tên đăng nhập</label>
          <input
            id="username"
            className="form-input"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            className="form-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <p className="login-note">
          Tài khoản cổng khách hàng do nhân viên kho cấp. Liên hệ quản lý kho
          nếu bạn chưa có tài khoản hoặc cần cấp lại mật khẩu.
        </p>
      </form>
    </div>
  );
}
