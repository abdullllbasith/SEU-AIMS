import { useAuth } from '../state/AuthProvider.jsx';
import { ROLES } from '../constants/roles.js';
import { StudentDashboardPage } from '../modules/student-experience/StudentDashboardPage.jsx';

export function FoundationHome() {
  const { user } = useAuth();
  if (user?.role === ROLES.STUDENT) {
    return <StudentDashboardPage />;
  }

  return (
    <section>
      <h1>Workspace</h1>
      <p>
        Signed in as {user?.role}. Use the header links for academic administration, assigned
        offerings, official resources, notices, and calendar.
      </p>
      <p>Study Room is student-only and is not part of this workspace.</p>
    </section>
  );
}
