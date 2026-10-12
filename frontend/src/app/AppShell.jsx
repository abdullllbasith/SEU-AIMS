import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider.jsx';
import { NotificationBell } from '../modules/communication/NotificationBell.jsx';
import { navForRole, roleLabel } from '../ui/role-nav.js';
import { StatIcon } from '../ui/stat-icons.jsx';

const RAIL_COLLAPSE_KEY = 'seu-aims-rail-collapsed';

function BrandMark({ size = 'rail' }) {
  const iconSize = size === 'guest' ? 24 : 18;
  return (
    <div className={`brand-mark brand-mark--${size}`}>
      <span className="brand-mark__icon" aria-hidden="true">
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={size === 'guest' ? 2 : 2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      </span>
      <span className="brand-mark__copy">
        <span className="app-shell__title">SEU-AIMS</span>
        <span className="app-shell__subtitle">
          {size === 'guest' ? 'Department VLE / LMS' : 'Department LMS'}
        </span>
      </span>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      className="topbar-search__icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function NavItems({ items, onNavigate, collapsed }) {
  return items.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={Boolean(item.end)}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => (isActive ? 'is-active' : undefined)}
      onClick={onNavigate}
    >
      <StatIcon name={item.icon || 'home'} className="nav-item__icon" />
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

function readCollapsedPreference() {
  try {
    return window.localStorage.getItem(RAIL_COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppShell({ children }) {
  const { user, status, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(readCollapsedPreference);
  const authenticated = status === 'authenticated' && user;
  const nav = authenticated ? navForRole(user.role) : { primary: [], more: [], searchTo: '', searchLabel: '' };

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_COLLAPSE_KEY, railCollapsed ? '1' : '0');
    } catch {
      /* ignore quota / private mode */
    }
  }, [railCollapsed]);

  if (!authenticated) {
    return (
      <div className="app-shell app-shell--guest">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <aside className="guest-brand">
          <BrandMark size="guest" />
          <p className="guest-brand__line">
            South Eastern University of Sri Lanka · Department Academic &amp; Examination Management
            Workspace
          </p>
          <ul className="guest-brand__features">
            <li>Official Continuous Assessment &amp; Recovery</li>
            <li>GPA / CGPA Recalculation &amp; Transcripts</li>
            <li>End-to-End Encrypted Study Room</li>
          </ul>
        </aside>
        <main id="main-content" className="guest-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    );
  }

  const shellClass = [
    'app-shell',
    'app-shell--app',
    menuOpen ? 'is-nav-open' : '',
    railCollapsed ? 'is-rail-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menuOpen ? (
        <button
          type="button"
          className="nav-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <aside className="app-rail" id="app-rail">
        <div className="app-rail__brand">
          <BrandMark size="rail" />
          <button
            type="button"
            className="rail-collapse"
            aria-pressed={railCollapsed}
            aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setRailCollapsed((value) => !value)}
          >
            <StatIcon name="panel" className="rail-collapse__icon" />
          </button>
        </div>

        <nav className="app-rail__nav" aria-label="Primary">
          <NavItems
            items={nav.primary}
            collapsed={railCollapsed}
            onNavigate={() => setMenuOpen(false)}
          />
        </nav>

        {nav.more.length ? (
          <nav className="app-rail__nav app-rail__nav--more" aria-label="More">
            <p className="app-rail__section">Workspace</p>
            <NavItems
              items={nav.more}
              collapsed={railCollapsed}
              onNavigate={() => setMenuOpen(false)}
            />
          </nav>
        ) : null}

        <div className="app-rail__user">
          <span className="avatar" aria-hidden="true">
            {initials(user)}
          </span>
          <div className="app-rail__user-copy">
            <p className="app-rail__name">{user.displayName || user.email}</p>
            <p className="app-rail__role">{roleLabel(user.role)}</p>
          </div>
          <button
            type="button"
            className="app-rail__signout"
            onClick={() => logout()}
            title="Sign out"
            aria-label="Sign out"
          >
            <StatIcon name="logout" className="app-rail__signout-icon" />
            <span className="app-rail__signout-label">Sign out</span>
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
              <SearchIcon />
              <span className="topbar-search__label">{nav.searchLabel}</span>
            </Link>
          ) : (
            <span className="topbar-search topbar-search--static">
              <SearchIcon />
              <span className="topbar-search__label">Academic Workspace</span>
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
