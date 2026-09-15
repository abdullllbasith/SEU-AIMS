import { Link } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider.jsx';
import { ROLES } from '../constants/roles.js';
import { StudentDashboardPage } from '../modules/student-experience/StudentDashboardPage.jsx';
import { LecturerDashboardPage } from '../modules/lecturer/LecturerDashboardPage.jsx';

export function FoundationHome() {
  const { user } = useAuth();
  if (user?.role === ROLES.STUDENT) {
    return <StudentDashboardPage />;
  }

  if (user?.role === ROLES.LECTURER) {
    return <LecturerDashboardPage />;
  }

  return (
    <section>
      <h1>Workspace</h1>
      <p>Signed in as Department Administrator. Study Room is student-only except moderation.</p>
      <ul>
        <li>
          <Link to="/admin">Operations dashboard</Link>
        </li>
        <li>
          <Link to="/admin/academic">Academic foundation</Link>
        </li>
        <li>
          <Link to="/admin/results">Result imports</Link>
        </li>
        <li>
          <Link to="/admin/ca">CA recovery</Link>
        </li>
        <li>
          <Link to="/admin/ops">Operations</Link>
        </li>
      </ul>
    </section>
  );
}
