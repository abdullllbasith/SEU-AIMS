import { Link } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider.jsx';
import { ROLES } from '../constants/roles.js';

export function AppShell({ children }) {
  const { user, status, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <p className="app-shell__title">SEU-AIMS</p>
        <p className="app-shell__subtitle">Department VLE / LMS</p>
        {status === 'authenticated' && user ? (
          <nav className="app-shell__nav">
            <span>
              {user.displayName || user.email} ({user.role})
            </span>
            {user.role === ROLES.DEPARTMENT_ADMINISTRATOR ? (
              <Link to="/admin/academic">Academic admin</Link>
            ) : null}
            {user.role === ROLES.STUDENT ? <Link to="/academic/me">My academic context</Link> : null}
            {user.role === ROLES.LECTURER ? <Link to="/lecturer/offerings">Assigned offerings</Link> : null}
            <button type="button" onClick={() => logout()}>
              Sign out
            </button>
          </nav>
        ) : (
          <nav className="app-shell__nav">
            <Link to="/login">Sign in</Link>
          </nav>
        )}
      </header>
      <main className="app-shell__main">{children}</main>
    </div>
  );
}
