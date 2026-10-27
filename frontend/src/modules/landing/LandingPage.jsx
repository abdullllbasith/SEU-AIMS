import { Link } from 'react-router-dom';
import './landing.css';

const FEATURES = [
  {
    title: 'Continuous Assessment & Recovery',
    body: 'Official CA records, lecturer entry and a clear recovery path, with department sign-off recorded by an administrator.',
    icon: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  {
    title: 'Results, GPA & Transcripts',
    body: 'Results match registration number and subject code. GPA and CGPA recalculate from official results.',
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" />
      </>
    ),
  },
  {
    title: 'Learning Materials',
    body: 'Lecturers publish materials and notices per subject offering. Students find everything in one place.',
    icon: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </>
    ),
  },
  {
    title: 'Encrypted Study Room',
    body: 'A private, student-only space for group study with realtime chat.',
    icon: (
      <>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
  },
  {
    title: 'Notices & Calendar',
    body: 'Department notices, deadlines and notifications delivered to the right people.',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
  },
  {
    title: 'Department Administration',
    body: 'Manage people, batches, offerings and results with every action checked by the backend.',
    icon: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
  },
];

const ROLES = [
  {
    name: 'Students',
    body: 'Follow subjects, see results and GPA, track CA status and study together.',
  },
  {
    name: 'Lecturers',
    body: 'Run your offerings, share materials, record assessment and review CA cases.',
  },
  {
    name: 'Department Administrators',
    body: 'Keep people, results and academic records accurate and auditable.',
  },
];

function Icon({ children, size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function LandingPage() {
  return (
    <div className="landing">
      <a className="skip-link" href="#landing-main">
        Skip to content
      </a>

      <header className="landing__hero">
        <span className="landing__glow" aria-hidden="true" />
        <nav className="landing__nav" aria-label="Main">
          <div className="landing__brand">
            <span className="landing__brand-icon">
              <Icon size={22}>
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </Icon>
            </span>
            <span className="landing__brand-copy">
              <strong>SEU-AIMS</strong>
              <small>Department VLE / LMS</small>
            </span>
          </div>
          <Link className="landing__login" to="/login">
            Login
          </Link>
        </nav>

        <div className="landing__hero-body" id="landing-main" tabIndex={-1}>
          <p className="landing__eyebrow">South Eastern University of Sri Lanka</p>
          <h1>
            Your department’s <span>academic workspace</span>, in one place.
          </h1>
          <p className="landing__lead">
            Coursework, continuous assessment, results and study groups for students, lecturers and
            department administrators, built for a single department.
          </p>
          <div className="landing__cta">
            <Link className="landing__btn landing__btn--primary" to="/login">
              Login to your account
            </Link>
            <a className="landing__btn landing__btn--ghost" href="#features">
              Explore features
            </a>
          </div>
          <ul className="landing__stats" aria-label="Highlights">
            <li>
              <strong>3</strong>
              <span>Focused roles</span>
            </li>
            <li>
              <strong>CA</strong>
              <span>Recovery built in</span>
            </li>
            <li>
              <strong>GPA</strong>
              <span>Auto recalculation</span>
            </li>
          </ul>
        </div>
      </header>

      <main>
        <section className="landing__section" id="features" aria-labelledby="features-title">
          <p className="landing__kicker">Platform</p>
          <h2 id="features-title">Everything the department needs</h2>
          <p className="landing__section-lead">
            One platform for teaching, assessment and records, with access enforced on the server.
          </p>
          <ul className="landing__grid">
            {FEATURES.map((feature) => (
              <li className="landing__card" key={feature.title}>
                <span className="landing__card-icon">
                  <Icon>{feature.icon}</Icon>
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing__section landing__section--alt" aria-labelledby="roles-title">
          <p className="landing__kicker">Who it is for</p>
          <h2 id="roles-title">Built around three roles</h2>
          <ul className="landing__roles">
            {ROLES.map((role) => (
              <li key={role.name}>
                <h3>{role.name}</h3>
                <p>{role.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing__final" aria-labelledby="cta-title">
          <h2 id="cta-title">Ready to get started?</h2>
          <p>Sign in with your account email to continue.</p>
          <Link className="landing__btn landing__btn--primary" to="/login">
            Login
          </Link>
        </section>
      </main>

      <footer className="landing__footer">
        <span>© SEU-AIMS · Department Academic &amp; Examination Management</span>
      </footer>
    </div>
  );
}
