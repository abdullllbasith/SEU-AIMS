import { Link } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider.jsx';
import { ROLES } from '../constants/roles.js';
import { NotificationBell } from '../modules/communication/NotificationBell.jsx';

export function AppShell({ children }) {
  const { user, status, logout } = useAuth();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="app-shell__header">
        <p className="app-shell__title">SEU-AIMS</p>
        <p className="app-shell__subtitle">Department VLE / LMS</p>
        {status === 'authenticated' && user ? (
          <nav className="app-shell__nav">
            <span>
              {user.displayName || user.email} ({user.role})
            </span>
            <NotificationBell />
            <Link to="/profile">Profile</Link>
            {user.role === ROLES.DEPARTMENT_ADMINISTRATOR ? (
              <>
                <Link to="/admin/academic">Academic admin</Link>
                <Link to="/admin/resources">Official resources</Link>
                <Link to="/admin/results">Result imports</Link>
                <Link to="/admin/ca">CA recovery</Link>
                <Link to="/notices">Notices</Link>
                <Link to="/calendar">Calendar</Link>
                <Link to="/admin/study-room">Study Room moderation</Link>
              </>
            ) : null}
            {user.role === ROLES.STUDENT ? (
              <>
                <Link to="/">Dashboard</Link>
                <Link to="/academic/me">My academic context</Link>
                <Link to="/academic/history">Academic history</Link>
                <Link to="/results/me">My results</Link>
                <Link to="/performance">Performance</Link>
                <Link to="/ca">CA recovery</Link>
                <Link to="/learning">Official learning</Link>
                <Link to="/notices">Notices</Link>
                <Link to="/calendar">Calendar</Link>
                <Link to="/study-room">Study Room</Link>
              </>
            ) : null}
            {user.role === ROLES.LECTURER ? (
              <>
                <Link to="/lecturer/offerings">Assigned offerings</Link>
                <Link to="/lecturer/learning">Official resources</Link>
                <Link to="/lecturer/ca">CA scheduling</Link>
                <Link to="/notices">Notices</Link>
                <Link to="/calendar">Calendar</Link>
              </>
            ) : null}
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
      <main id="main-content" className="app-shell__main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
