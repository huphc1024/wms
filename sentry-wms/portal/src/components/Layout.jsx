import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, hasFeature } from '../auth.jsx';
import { BRAND_NAME, PORTAL_NAME } from '../brand.js';

/**
 * Nav is filtered by the feature grants on /auth/me. That is a
 * convenience, not the control: @require_customer_feature returns 403 on
 * a direct URL hit regardless of what this renders -- same client-hides /
 * server-enforces split as the admin sidebar (docs/patterns.md §6).
 */
const NAV = [
  { to: '/', label: 'Tổng quan', feature: null, end: true },
  { to: '/inventory', label: 'Tồn kho', feature: 'inventory' },
  { to: '/orders', label: 'Đơn xuất', feature: 'orders' },
  { to: '/inbound', label: 'Hàng nhập', feature: 'inbound' },
  { to: '/invoices', label: 'Hóa đơn', feature: 'invoices' },
];

export function PortalLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="5" fill="#8e2715" />
      <rect x="7" y="6" width="7.5" height="20" rx="1.5" fill="none" stroke="#FCF4E3" strokeWidth="1.6" />
      <rect x="17.5" y="6" width="7.5" height="20" rx="1.5" fill="none" stroke="#FCF4E3" strokeWidth="1.6" />
      <line x1="8.5" y1="12" x2="13" y2="12" stroke="#FCF4E3" strokeWidth="1" opacity="0.4" />
      <line x1="8.5" y1="16" x2="13" y2="16" stroke="#FCF4E3" strokeWidth="1" opacity="0.4" />
      <line x1="8.5" y1="20" x2="13" y2="20" stroke="#FCF4E3" strokeWidth="1" opacity="0.4" />
      <line x1="19" y1="12" x2="23.5" y2="12" stroke="#FCF4E3" strokeWidth="1" opacity="0.4" />
      <line x1="19" y1="16" x2="23.5" y2="16" stroke="#FCF4E3" strokeWidth="1" opacity="0.4" />
      <line x1="19" y1="20" x2="23.5" y2="20" stroke="#FCF4E3" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

export default function Layout() {
  const { account, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV.filter((n) => !n.feature || hasFeature(account, n.feature));

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <PortalLogo />
          <div>
            <strong>{BRAND_NAME}</strong>
            <span>{PORTAL_NAME}</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/change-password" className="nav-link nav-link-quiet">
            Đổi mật khẩu
          </NavLink>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-customer">
            <strong>{account?.customer_name || '—'}</strong>
            {account?.customer_code && <span className="mono">{account.customer_code}</span>}
          </div>
          <div className="topbar-user">
            <span>{account?.full_name || account?.username}</span>
            <button type="button" className="btn btn-sm" onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
