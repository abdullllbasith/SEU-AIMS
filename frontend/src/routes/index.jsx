import { Navigate, Route, Routes } from 'react-router-dom';
import { FoundationHome } from './FoundationHome.jsx';
import { LoginPage } from '../modules/auth/LoginPage.jsx';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { ForgotPasswordPage } from '../modules/auth/ForgotPasswordPage.jsx';
import { ResetPasswordPage } from '../modules/auth/ResetPasswordPage.jsx';
import { AcademicAdminPage } from '../modules/admin/AcademicAdminPage.jsx';
import { StudentAcademicPage } from '../modules/academic/StudentAcademicPage.jsx';
import { LecturerOfferingsPage } from '../modules/academic/LecturerOfferingsPage.jsx';
import { ROLES } from '../constants/roles.js';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <FoundationHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/academic"
        element={
          <ProtectedRoute roles={[ROLES.DEPARTMENT_ADMINISTRATOR]}>
            <AcademicAdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/academic/me"
        element={
          <ProtectedRoute roles={[ROLES.STUDENT]}>
            <StudentAcademicPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lecturer/offerings"
        element={
          <ProtectedRoute roles={[ROLES.LECTURER]}>
            <LecturerOfferingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
