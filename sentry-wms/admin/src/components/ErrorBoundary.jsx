import React from 'react';
import { logBoundaryError } from '../utils/safeLogging';

function isVi() {
  try {
    return (localStorage.getItem('sentry_admin_locale') || 'vi') === 'vi';
  } catch {
    return true;
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logBoundaryError(error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      const vi = isVi();
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          background: '#f7f3ec',
          border: '1px solid #e0d9cc',
          borderRadius: '8px',
          margin: '1rem'
        }}>
          <h2 style={{ color: '#8e2716' }}>
            {vi ? 'Đã xảy ra lỗi' : 'Something went wrong'}
          </h2>
          <p style={{ color: '#666' }}>
            {this.props.fallbackMessage
              || (vi
                ? 'Phần này gặp lỗi. Hãy thử làm mới trang.'
                : 'This section encountered an error. Try refreshing.')}
          </p>
          <button
            onClick={this.reset}
            style={{
              background: '#8e2716',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {vi ? 'Thử lại' : 'Retry'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
