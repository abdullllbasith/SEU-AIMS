import { Navigate, Route, Routes } from 'react-router-dom';
import { FoundationHome } from './FoundationHome.jsx';
import { LoginPage } from '../modules/auth/LoginPage.jsx';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { ForgotPasswordPage } from '../modules/auth/ForgotPasswordPage.jsx';
import { ResetPasswordPage } from '../modules/auth/ResetPasswordPage.jsx';
import { AcademicAdminPage } from '../modules/admin/AcademicAdminPage.jsx';
import { AdminResourcesPage } from '../modules/admin/AdminResourcesPage.jsx';
import { StudentAcademicPage } from '../modules/academic/StudentAcademicPage.jsx';
import { LecturerOfferingsPage } from '../modules/academic/LecturerOfferingsPage.jsx';
import { StudentLearningPage } from '../modules/learning/StudentLearningPage.jsx';
import { LecturerLearningPage } from '../modules/learning/LecturerLearningPage.jsx';
import { OfferingLearningPage } from '../modules/learning/OfferingLearningPage.jsx';
import { StudyRoomPage } from '../modules/study-room/StudyRoomPage.jsx';
import { AdminStudyRoomModerationPage } from '../modules/admin/AdminStudyRoomModerationPage.jsx';
import { AdminResultsPage } from '../modules/admin/AdminResultsPage.jsx';
import { StudentResultsPage } from '../modules/results/StudentResultsPage.jsx';
import { StudentCaPage } from '../modules/ca-recovery/StudentCaPage.jsx';
import { AdminCaPage } from '../modules/admin/AdminCaPage.jsx';
import { LecturerCaPage } from '../modules/ca-recovery/LecturerCaPage.jsx';
import { NotificationsPage } from '../modules/communication/NotificationsPage.jsx';
import { NoticesPage } from '../modules/communication/NoticesPage.jsx';
import { CalendarPage } from '../modules/communication/CalendarPage.jsx';
import { StudentDashboardPage } from '../modules/student-experience/StudentDashboardPage.jsx';
import { ProfilePage } from '../modules/student-experience/ProfilePage.jsx';
import { AcademicHistoryPage } from '../modules/student-experience/AcademicHistoryPage.jsx';
import { PerformancePage } from '../modules/student-experience/PerformancePage.jsx';
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
        path="/dashboard"
        element={
          <ProtectedRoute roles={[ROLES.STUDENT]}>
            <StudentDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/academic/history"
        element={
          <ProtectedRoute roles={[ROLES.STUDENT]}>
            <AcademicHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/performance"
        element={
          <ProtectedRoute roles={[ROLES.STUDENT]}>
            <PerformancePage />
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
      <Route
        path="/learning"
        element={
          <ProtectedRoute roles={[ROLES.STUDENT]}>
            <StudentLearningPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lecturer/learning"
        element={
          <ProtectedRoute roles={[ROLES.LECTURER]}>
            <LecturerLearningPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/resources"
        element={
          <ProtectedRoute roles={[ROLES.DEPARTMENT_ADMINISTRATOR]}>
            <AdminResourcesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/learning/offerings/:offeringId"
        element={
          <ProtectedRoute>
            <OfferingLearningPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/results"
        element={
          <ProtectedRoute roles={[ROLES.DEPARTMENT_ADMINISTRATOR]}>
            <AdminResultsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/results/me"
        element={
          <ProtectedRoute roles={[ROLES.STUDENT]}>
            <StudentResultsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ca"
        element={
          <ProtectedRoute roles={[ROLES.STUDENT]}>
            <StudentCaPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/ca"
        element={
          <ProtectedRoute roles={[ROLES.DEPARTMENT_ADMINISTRATOR]}>
            <AdminCaPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lecturer/ca"
        element={
          <ProtectedRoute roles={[ROLES.LECTURER]}>
            <LecturerCaPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notices"
        element={
          <ProtectedRoute>
            <NoticesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <CalendarPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/study-room"
        element={
          <ProtectedRoute roles={[ROLES.STUDENT]}>
            <StudyRoomPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/study-room"
        element={
          <ProtectedRoute roles={[ROLES.DEPARTMENT_ADMINISTRATOR]}>
            <AdminStudyRoomModerationPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
