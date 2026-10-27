import { Navigate } from 'react-router-dom';
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

  if (user?.role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    return <Navigate to="/admin" replace />;
  }

  return null;
}
