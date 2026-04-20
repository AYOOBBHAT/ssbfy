import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Route guard for admin-only pages.
 *
 * - While the auth context is bootstrapping → render a tiny placeholder.
 * - If not authenticated → redirect to /login (preserves intended path).
 * - If authenticated but role !== "admin" → redirect to /login with a flag
 *   so the login screen can show a message.
 *
 * NOTE: This is UI-only protection. The backend independently enforces
 * `requireRole("admin")` on every admin endpoint, so even if this guard
 * is bypassed (e.g. by editing the bundle), the API will still return 403.
 */
export default function RequireAdmin({ children }) {
  const { initializing, isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();

  if (initializing) {
    return <div className="boot-screen">Loading…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!isAdmin) {
    return <Navigate to="/login" replace state={{ from: location, denied: true }} />;
  }

  return children;
}
