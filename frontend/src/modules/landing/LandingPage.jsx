import { Link } from 'react-router-dom';
import './landing.css';

const DEPARTMENTS = [
  {
    code: 'ICT',
    name: 'Department of Information & Communication Technology',
    degree: 'Bachelor of Information and Communication Technology Honours — BICT(Hons)',
    description:
      'Advancing technical excellence across software engineering, data science, networking, cloud systems, and cybersecurity. Manages semester course offerings, computing laboratories, continuous assessments, and technical capstone project evaluations.',
    tags: ['Software Engineering', 'Computer Networks', 'Database Systems', 'Applied AI', 'Capstone Research'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    code: 'BST',
    name: 'Department of Biosystems Technology',
    degree: 'Bachelor of Biosystems Technology Honours — BBST(Hons)',
    description:
      'Integrating modern technological engineering with biological, agricultural, bio-industrial, and environmental systems. Manages specialized biotechnology laboratories, semester unit curricula, field training, and continuous assessment tracking.',
    tags: ['Agricultural Technology', 'Food Processing', 'Bio-energy Systems', 'Environmental Engineering', 'Industrial Tech'],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12a10 10 0 0 1 10-10z" />
        <path d="M12 6v6l4 2" />
        <path d="M7 16.5c1.5-1.5 3-2 5-2s3.5.5 5 2" />
      </svg>
    ),
  },
];

const MODULES = [
  {
    title: 'Continuous Assessment (CA) & Recovery System',
    body: 'Standardized assessment marks entry by lecturers with automated threshold monitoring. Flags incomplete or E(CA) conditions and coordinates structured end-of-semester CA recovery examination applications with physical Head of Department (HOD) endorsement.',
    category: 'Assessment & Eligibility',
    icon: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  {
    title: 'Course Offerings & Official Syllabus Materials',
    body: 'Complete course units organized by semester and batch. Academic staff publish authoritative lecture notes, slides, tutorial assignments, and syllabus resources, ensuring students access official coursework materials in one verified location.',
    category: 'Teaching & Learning',
    icon: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </>
    ),
  },
  {
    title: 'Official Examination Results & GPA Engine',
    body: 'Authentic semester examination results mapped strictly by Student Registration Number and Course Unit Code. Instant computation of Semester GPA (SGPA) and Cumulative GPA (CGPA) in strict compliance with Faculty of Technology classification criteria.',
    category: 'Academic Records',
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" />
      </>
    ),
  },
  {
    title: 'Faculty Notices & Academic Calendar',
    body: 'Centralized broadcast of faculty circulars, departmental announcements, lecture schedules, deadline alerts, and semester examination timetables, keeping undergraduates and lecturers in continuous synchronization.',
    category: 'Faculty Communications',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
  },
  {
    title: 'Encrypted Peer Study Room',
    body: 'A dedicated, student-only virtual collaboration space for coursework discussion, group study sessions, and peer academic exchange, protected with privacy boundaries to foster independent peer learning.',
    category: 'Collaborative Workspace',
    icon: (
      <>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
  },
  {
    title: 'Department Administration & Audit Integrity',
    body: 'Comprehensive institutional tooling for student batch allotments, course unit allocations, academic staff assignments, and tamper-resistant audit logs for grade sheet updates.',
    category: 'Institutional Governance',
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
    name: 'Undergraduate Students',
    badge: 'Undergraduate Portal',
    body: 'Follow enrolled course units, monitor real-time CA scores, apply for CA recovery exam windows, review official results, track cumulative GPA trajectories, and engage in peer study rooms.',
  },
  {
    name: 'Academic Staff & Lecturers',
    badge: 'Instructional Portal',
    body: 'Coordinate semester course offerings, share authoritative lecture materials, record continuous assessments, review student CA recovery conditions, and issue course announcements.',
  },
  {
    name: 'Department Administrators',
    badge: 'Administrative Portal',
    body: 'Manage student registrations, configure academic batches and offerings, verify semester grade sheets, record physical HOD endorsements, and uphold institutional audit compliance.',
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

      {/* University & Faculty Institutional Header */}
      <header className="landing__hero">
        <span className="landing__glow" aria-hidden="true" />
        
        <nav className="landing__nav" aria-label="Main Navigation">
          <div className="landing__brand-lockup">
            <div className="guest-brand__system-badge landing__aims-badge">
              <img
                src="/SEU-AIMS Academic Logo.png"
                alt="SEU-AIMS Academic Intelligence & Management System"
                className="guest-brand__logo"
              />
              <span className="guest-brand__system-name">SEU-AIMS</span>
            </div>
          </div>

          <div className="landing__nav-links">
            <a href="#overview">Overview</a>
            <a href="#departments">Departments</a>
            <a href="#modules">Academic Modules</a>
            <a href="#roles">Portals</a>
          </div>

          <div className="landing__nav-actions">
            <Link className="landing__login" to="/login">
              Sign In
            </Link>
          </div>
        </nav>

        {/* Hero Body */}
        <div className="landing__hero-body" id="landing-main" tabIndex={-1}>
          <div className="landing__institution-pill">
            <span className="landing__pill-dot" aria-hidden="true" />
            <span>Faculty of Technology · South Eastern University of Sri Lanka</span>
          </div>

          <h1>
            Academic Intelligence &amp; <span>Management System</span>
          </h1>

          <p className="landing__lead">
            SEU-AIMS is the official unified platform for the Faculty of Technology, South Eastern University
            of Sri Lanka. It brings together course offerings, continuous assessment (CA) tracking, verified
            examination results, GPA computation, and collaborative learning in one secure system for students,
            lecturers, and administrators.
          </p>

          <div className="landing__cta">
            <Link className="landing__btn landing__btn--primary" to="/login">
              Sign in to Academic Portal
            </Link>
            <a className="landing__btn landing__btn--ghost" href="#modules">
              Explore Academic Modules
            </a>
          </div>

          {/* Institutional Highlights */}
          <ul className="landing__stats" aria-label="Key Highlights">
            <li>
              <strong>Faculty of Technology</strong>
              <span>Undergraduate Degree Programs (BICT &amp; BBST)</span>
            </li>
            <li>
              <strong>Continuous Assessment</strong>
              <span>Official CA Management &amp; Recovery Exams</span>
            </li>
            <li>
              <strong>Examination Unit</strong>
              <span>Registration-Verified Results &amp; GPA Engine</span>
            </li>
            <li>
              <strong>Oluvil Campus</strong>
              <span>South Eastern University of Sri Lanka</span>
            </li>
          </ul>
        </div>
      </header>

      <main>
        {/* Academic Departments Section */}
        <section className="landing__section" id="departments" aria-labelledby="departments-title">
          <p className="landing__kicker">Academic Units</p>
          <h2 id="departments-title">Faculty of Technology Departments</h2>
          <p className="landing__section-lead">
            Delivering industry-focused technology education, laboratory research, and applied innovation
            across two specialized academic departments.
          </p>

          <div className="landing__departments-grid">
            {DEPARTMENTS.map((dept) => (
              <article className="landing__dept-card" key={dept.code}>
                <div className="landing__dept-header">
                  <span className="landing__dept-icon">{dept.icon}</span>
                  <div>
                    <span className="landing__dept-code">{dept.code}</span>
                    <h3>{dept.name}</h3>
                  </div>
                </div>
                <p className="landing__dept-degree">{dept.degree}</p>
                <p className="landing__dept-desc">{dept.description}</p>
                <div className="landing__dept-tags">
                  {dept.tags.map((tag) => (
                    <span className="landing__tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Core Academic Modules */}
        <section className="landing__section landing__section--modules" id="modules" aria-labelledby="modules-title">
          <p className="landing__kicker">Academic Modules</p>
          <h2 id="modules-title">Comprehensive Academic Capabilities</h2>
          <p className="landing__section-lead">
            Purpose-built academic infrastructure supporting teaching, continuous assessment, examination grading,
            and administrative governance for the Faculty of Technology.
          </p>

          <ul className="landing__grid">
            {MODULES.map((module) => (
              <li className="landing__card" key={module.title}>
                <div className="landing__card-top">
                  <span className="landing__card-icon">
                    <Icon>{module.icon}</Icon>
                  </span>
                  <span className="landing__card-category">{module.category}</span>
                </div>
                <h3>{module.title}</h3>
                <p>{module.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Roles Section */}
        <section className="landing__section landing__section--alt" id="roles" aria-labelledby="roles-title">
          <p className="landing__kicker">Authorized Portals</p>
          <h2 id="roles-title">Built for Faculty Roles</h2>
          <p className="landing__section-lead">
            Role-based security enforcing strict boundaries between student learning, academic evaluation,
            and departmental administration.
          </p>

          <ul className="landing__roles">
            {ROLES.map((role) => (
              <li key={role.name}>
                <span className="landing__role-badge">{role.badge}</span>
                <h3>{role.name}</h3>
                <p>{role.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Final University CTA Banner */}
        <section className="landing__final" aria-labelledby="cta-title">
          <div className="landing__final-crest">
            <img
              src="/South_Eastern_University_of_Sri_Lanka_logo.png"
              alt="SEUSL Emblem"
              className="landing__final-crest-img"
            />
          </div>
          <p className="landing__final-eyebrow">South Eastern University of Sri Lanka · Faculty of Technology</p>
          <h2 id="cta-title">Access the Faculty of Technology Portal</h2>
          <p>
            Sign in with your university credentials to manage coursework, continuous assessment, official
            examination results, and academic records.
          </p>
          <Link className="landing__btn landing__btn--primary landing__btn--lg" to="/login">
            Sign in
          </Link>
        </section>
      </main>

      {/* Institutional University Footer */}
      <footer className="landing__footer">
        <div className="landing__footer-inner">
          <div className="landing__footer-brand">
            <img
              src="/South_Eastern_University_of_Sri_Lanka_logo.png"
              alt="South Eastern University of Sri Lanka"
              className="landing__footer-crest"
            />
            <div>
              <p className="landing__footer-title">South Eastern University of Sri Lanka</p>
              <p className="landing__footer-faculty">Faculty of Technology · SEU-AIMS</p>
              <p className="landing__footer-address">University Park, Oluvil #32360, Sri Lanka</p>
            </div>
          </div>
          <div className="landing__footer-dept-list">
            <p><strong>Departments:</strong></p>
            <ul>
              <li>Department of Information &amp; Communication Technology (ICT)</li>
              <li>Department of Biosystems Technology (BST)</li>
            </ul>
          </div>
        </div>
        <div className="landing__footer-bottom">
          <span>© SEU-AIMS · Faculty of Technology · South Eastern University of Sri Lanka. All Rights Reserved.</span>
        </div>
      </footer>
    </div>
  );
}
