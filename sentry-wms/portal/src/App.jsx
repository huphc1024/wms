import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth, hasFeature } from './auth.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventory from './pages/Inventory.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import NewOrder from './pages/NewOrder.jsx';
import Inbound from './pages/Inbound.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoiceDetail from './pages/InvoiceDetail.jsx';

function ProtectedRoute({ children }) {
  const { account, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!account) return <Navigate to="/login" replace />;
  // Forced password change (mig 088 defaults must_change_password TRUE on
  // every provisioned login). /auth/me is the source of truth: the
  // middleware answers 403 password_change_required on every other portal
  // endpoint anyway, so letting the user roam would only show them empty
  // pages.
  if (account.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return children;
}

/**
 * Feature gate for a whole route.
 *
 * Cosmetic, exactly like the nav filter: @require_customer_feature
 * returns 403 on the API call regardless. Its job is to explain the
 * situation ("chưa được cấp quyền") instead of rendering a page that
 * loads into an error box.
 */
function FeatureRoute({ feature, children }) {
  const { account } = useAuth();
  if (!hasFeature(account, feature)) {
    return (
      <div className="page page-narrow">
        <h1>Chưa được cấp quyền</h1>
        <div className="alert alert-warning" role="status">
          Tài khoản của bạn chưa được cấp quyền cho mục này. Liên hệ quản lý kho
          nếu bạn cần xem dữ liệu đó.
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<ErrorBoundary fallbackMessage="Không tải được trang đăng nhập."><Login /></ErrorBoundary>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route
          path="/"
          element={<ErrorBoundary fallbackMessage="Không tải được trang tổng quan."><Dashboard /></ErrorBoundary>}
        />
        <Route
          path="/change-password"
          element={<ErrorBoundary fallbackMessage="Không tải được form đổi mật khẩu."><ChangePassword /></ErrorBoundary>}
        />
        <Route
          path="/inventory"
          element={(
            <FeatureRoute feature="inventory">
              <ErrorBoundary fallbackMessage="Không tải được tồn kho."><Inventory /></ErrorBoundary>
            </FeatureRoute>
          )}
        />
        <Route
          path="/orders"
          element={(
            <FeatureRoute feature="orders">
              <ErrorBoundary fallbackMessage="Không tải được đơn xuất."><Orders /></ErrorBoundary>
            </FeatureRoute>
          )}
        />
        <Route
          path="/orders/new"
          element={(
            <FeatureRoute feature="orders">
              <ErrorBoundary fallbackMessage="Không tải được form yêu cầu xuất."><NewOrder /></ErrorBoundary>
            </FeatureRoute>
          )}
        />
        <Route
          path="/orders/:soNumber"
          element={(
            <FeatureRoute feature="orders">
              <ErrorBoundary fallbackMessage="Không tải được chi tiết đơn."><OrderDetail /></ErrorBoundary>
            </FeatureRoute>
          )}
        />
        <Route
          path="/inbound"
          element={(
            <FeatureRoute feature="inbound">
              <ErrorBoundary fallbackMessage="Không tải được hàng nhập."><Inbound /></ErrorBoundary>
            </FeatureRoute>
          )}
        />
        <Route
          path="/invoices"
          element={(
            <FeatureRoute feature="invoices">
              <ErrorBoundary fallbackMessage="Không tải được hóa đơn."><Invoices /></ErrorBoundary>
            </FeatureRoute>
          )}
        />
        <Route
          path="/invoices/:invoiceNumber"
          element={(
            <FeatureRoute feature="invoices">
              <ErrorBoundary fallbackMessage="Không tải được chi tiết hóa đơn."><InvoiceDetail /></ErrorBoundary>
            </FeatureRoute>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
