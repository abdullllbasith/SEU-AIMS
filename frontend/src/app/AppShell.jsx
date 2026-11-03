import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider.jsx';
import { NotificationBell } from '../modules/communication/NotificationBell.jsx';
import { refreshStudyRoomAttention, subscribeStudyRoomAttention } from '../modules/study-room/study-room-attention.js';
import { ROLES } from '../constants/roles.js';
import { navForRole, roleLabel } from '../ui/role-nav.js';
import { StatIcon } from '../ui/stat-icons.jsx';
import { UpdateBadge } from '../ui/UpdateBadge.jsx';

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
          {size === 'guest' ? 'Faculty of Technology' : 'Department LMS'}
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

function NavItems({ items, onNavigate, collapsed, badges = {} }) {
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
      <UpdateBadge count={badges[item.to]} label="updates" />
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
  const [studyRoomUpdates, setStudyRoomUpdates] = useState(0);
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

  useEffect(() => {
    if (user?.role !== ROLES.STUDENT) {
      setStudyRoomUpdates(0);
      return undefined;
    }
    const userId = user.id || user.userId;
    const unsubscribe = subscribeStudyRoomAttention((next) => setStudyRoomUpdates(next.total || 0));
    const pull = () => {
      refreshStudyRoomAttention(userId).catch(() => {});
    };
    pull();
    const timer = window.setInterval(pull, 20000);
    window.addEventListener('focus', pull);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener('focus', pull);
    };
  }, [user]);

  if (!authenticated && status === 'unauthenticated' && location.pathname === '/') {
    return <>{children}</>;
  }

  if (!authenticated) {
    return (
      <div className="app-shell app-shell--guest">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <aside className="guest-brand">
          <span className="guest-brand__glow" aria-hidden="true" />

          <div className="guest-brand__top">
            <div className="guest-brand__header">
              <div className="guest-brand__crest-container">
                <img
                  src="/South_Eastern_University_of_Sri_Lanka_logo.png"
                  alt="South Eastern University of Sri Lanka Crest"
                  className="guest-brand__uni-crest"
                />
              </div>
              <div className="guest-brand__header-titles">
                <span className="guest-brand__uni-name">South Eastern University of Sri Lanka</span>
                <span className="guest-brand__faculty-name">Faculty of Technology</span>
              </div>
            </div>
            <div className="guest-brand__system-badge">
              <BrandMark size="guest" />
            </div>
          </div>

          <div className="guest-brand__body">
            <div className="guest-brand__badge">
              <span className="guest-brand__badge-dot" aria-hidden="true" />
              <span>Academic &amp; Examination Workspace</span>
            </div>
            <h2 className="guest-brand__headline">
              Faculty of Technology <span>Academic Information</span> &amp; Management System
            </h2>
            <p className="guest-brand__line">
              Official institutional portal for undergraduates, academic staff, and administration
              across the Department of ICT and Department of Biosystems Technology.
            </p>

            <ul className="guest-brand__features">
              <li>
                <span className="guest-brand__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </span>
                <span className="guest-brand__feature-copy">
                  <strong>Course Offerings &amp; Lecture Materials</strong>
                  <small>Departmental syllabus resources, lecture slides &amp; schedules</small>
                </span>
              </li>
              <li>
                <span className="guest-brand__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </span>
                <span className="guest-brand__feature-copy">
                  <strong>Continuous Assessment (CA) &amp; Recovery</strong>
                  <small>Verified CA scores, cut-off tracking &amp; formal recovery exams</small>
                </span>
              </li>
              <li>
                <span className="guest-brand__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18" />
                    <path d="M7 15l4-4 3 3 5-6" />
                  </svg>
                </span>
                <span className="guest-brand__feature-copy">
                  <strong>Official Examination Results &amp; GPA Engine</strong>
                  <small>Registration-verified results with automatic SGPA &amp; CGPA</small>
                </span>
              </li>
              <li>
                <span className="guest-brand__icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </span>
                <span className="guest-brand__feature-copy">
                  <strong>Faculty Notices &amp; Peer Study Rooms</strong>
                  <small>Official circulars and secure, student-only collaboration</small>
                </span>
              </li>
            </ul>
          </div>

          <div className="guest-brand__foot">
            <div className="guest-brand__departments-list">
              <span>Dept. of Information &amp; Communication Technology</span>
              <span className="guest-brand__dept-dot">·</span>
              <span>Dept. of Biosystems Technology</span>
            </div>
            <p className="guest-brand__foot-sub">South Eastern University of Sri Lanka · University Park, Oluvil</p>
          </div>
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
      <aside className="app-rail" id="app-rail">
        <div className="app-rail__brand">
          <BrandMark size="rail" />
          <button
            type="button"
            className="rail-collapse"
            aria-pressed={railCollapsed}
            aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => {
              if (window.matchMedia('(max-width: 900px)').matches) {
                setMenuOpen(false);
                return;
              }
              setRailCollapsed((value) => !value);
            }}
          >
            <StatIcon name="panel" className="rail-collapse__icon" />
          </button>
        </div>

        <nav className="app-rail__nav" aria-label="Primary">
          <NavItems
            items={nav.primary}
            collapsed={railCollapsed}
            badges={{ '/study-room': studyRoomUpdates }}
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
