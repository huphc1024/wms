import React from 'react';
import { logBoundaryError } from '../utils/safeLogging';

/**
 * Same contract as admin/src/components/ErrorBoundary.jsx, minus the
 * locale switch: the portal renders Vietnamese only. Logging still goes
 * through safeLogging so no JWT or Bearer string reaches the console
 * (V-020) -- a customer's browser is the least controlled environment
 * this code runs in.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    logBoundaryError(error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="boundary-error" role="alert">
          <h2>Đã xảy ra lỗi</h2>
          <p>{this.props.fallbackMessage || 'Phần này gặp lỗi. Hãy thử làm mới trang.'}</p>
          <button type="button" className="btn btn-primary" onClick={this.reset}>
            Thử lại
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
