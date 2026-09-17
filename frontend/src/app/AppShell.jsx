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
      {item.label}
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
          <p className="app-shell__title">SEU-AIMS</p>
          <p className="app-shell__subtitle">Department VLE / LMS</p>
          <p className="guest-brand__line">South Eastern University · department academic workspace</p>
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
          <p className="app-shell__title">SEU-AIMS</p>
          <p className="app-shell__subtitle">Department VLE / LMS</p>
        </div>
        <nav className="app-rail__nav" aria-label="Primary">
          <NavItems items={nav.primary} onNavigate={() => setMenuOpen(false)} />
        </nav>
        {nav.more.length ? (
          <nav className="app-rail__nav app-rail__nav--more" aria-label="More">
            <p className="app-rail__section">More</p>
            <NavItems items={nav.more} onNavigate={() => setMenuOpen(false)} />
          </nav>
        ) : null}
        <div className="app-rail__user">
          <span className="avatar" aria-hidden="true">
            {initials(user)}
          </span>
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
              {nav.searchLabel}
            </Link>
          ) : (
            <span className="topbar-search topbar-search--static">SEU-AIMS</span>
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
