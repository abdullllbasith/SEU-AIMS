import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider.jsx';

export function ProtectedRoute({ children, roles }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'resolving') {
    return <p>Loading session…</p>;
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
