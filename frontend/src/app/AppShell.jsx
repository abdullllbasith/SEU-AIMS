import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider.jsx';
import { NotificationBell } from '../modules/communication/NotificationBell.jsx';
import { navForRole, roleLabel } from '../ui/role-nav.js';

function NavItems({ items, onNavigate }) {
  return items.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={Boolean(item.end)}
      className={({ isActive }) => (isActive ? 'is-active' : undefined)}
      onClick={onNavigate}
    >
      <span className="nav-item__indicator" aria-hidden="true" />
      <span className="nav-item__label">{item.label}</span>
    </NavLink>
  ));
}

function initials(user) {
  const source = user?.displayName || user?.email || 'U';
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  const letters = `${parts[0]?.[0] || 'U'}${parts[1]?.[0] || ''}`.toUpperCase();
  return letters.slice(0, 2);
}

export function AppShell({ children }) {
  const { user, status, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const authenticated = status === 'authenticated' && user;
  const nav = authenticated ? navForRole(user.role) : { primary: [], more: [], searchTo: '', searchLabel: '' };

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  if (!authenticated) {
    return (
      <div className="app-shell app-shell--guest">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <aside className="guest-brand" aria-hidden={false}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--brand-500), var(--brand-700))', display: 'grid', placeItems: 'center', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <div>
              <p className="app-shell__title" style={{ fontSize: '1.4rem' }}>SEU-AIMS</p>
              <p className="app-shell__subtitle" style={{ paddingLeft: 0, color: 'var(--brand-400)' }}>Department VLE / LMS</p>
            </div>
          </div>
          <p className="guest-brand__line">
            South Eastern University of Sri Lanka · Department Academic &amp; Examination Management Workspace
          </p>
          <div style={{ marginTop: '2.5rem', display: 'grid', gap: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.82rem', color: 'var(--slate-300)' }}>
              <span style={{ color: 'var(--emerald-400)' }}>✓</span> Official Continuous Assessment &amp; Recovery
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.82rem', color: 'var(--slate-300)' }}>
              <span style={{ color: 'var(--emerald-400)' }}>✓</span> GPA / CGPA Recalculation &amp; Transcripts
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.82rem', color: 'var(--slate-300)' }}>
              <span style={{ color: 'var(--emerald-400)' }}>✓</span> End-to-End Encrypted Study Room
            </div>
          </div>
        </aside>
        <main id="main-content" className="guest-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className={`app-shell app-shell--app${menuOpen ? ' is-nav-open' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menuOpen ? (
        <button type="button" className="nav-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      ) : null}
      <aside className="app-rail" id="app-rail">
        <div className="app-rail__brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--brand-500), var(--brand-700))', display: 'grid', placeItems: 'center', boxShadow: '0 2px 8px rgba(2, 132, 199, 0.4)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <div>
              <p className="app-shell__title" style={{ margin: 0, fontSize: '0.96rem' }}>SEU-AIMS</p>
              <p className="app-shell__subtitle" style={{ margin: 0, paddingLeft: 0, fontSize: '0.7rem' }}>Department LMS</p>
            </div>
          </div>
        </div>

        <nav className="app-rail__nav" aria-label="Primary">
          <NavItems items={nav.primary} onNavigate={() => setMenuOpen(false)} />
        </nav>

        {nav.more.length ? (
          <nav className="app-rail__nav app-rail__nav--more" aria-label="More">
            <p className="app-rail__section">Workspace</p>
            <NavItems items={nav.more} onNavigate={() => setMenuOpen(false)} />
          </nav>
        ) : null}

        <div className="app-rail__user">
          <div style={{ position: 'relative' }}>
            <span className="avatar" aria-hidden="true">
              {initials(user)}
            </span>
            <span style={{ position: 'absolute', bottom: '0', right: '0', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--emerald-500)', border: '1.5px solid var(--slate-900)' }} title="Online" />
          </div>
          <div>
            <p className="app-rail__name">{user.displayName || user.email}</p>
            <p className="app-rail__role">{roleLabel(user.role)}</p>
          </div>
          <button type="button" className="app-rail__signout" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-frame">
        <header className="app-topbar">
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="app-rail"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>
          {nav.searchTo ? (
            <Link className="topbar-search" to={nav.searchTo}>
              <span>{nav.searchLabel}</span>
            </Link>
          ) : (
            <span className="topbar-search topbar-search--static">
              <span>Academic Workspace</span>
            </span>
          )}
          <div className="app-topbar__tools">
            <NotificationBell />
          </div>
        </header>

        <main id="main-content" className="app-shell__main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
