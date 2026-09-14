import { useAuth } from '../state/AuthProvider.jsx';
import { ROLES } from '../constants/roles.js';

export function FoundationHome() {
  const { user } = useAuth();
  const studyRoomNote =
    user?.role === ROLES.STUDENT
      ? 'Study Room will be available to students in a later prompt.'
      : 'Study Room is student-only and is not part of this workspace.';

  return (
    <section>
      <h1>Foundation workspace</h1>
      <p>
        Signed in as {user?.role}. Use the header links for academic administration, assigned
        offerings, or your academic context.
      </p>
      <p>{studyRoomNote}</p>
    </section>
  );
}
