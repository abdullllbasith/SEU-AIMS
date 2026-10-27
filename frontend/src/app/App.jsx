import { AppShell } from './AppShell.jsx';
import { AppRoutes } from '../routes/index.jsx';
import { AuthProvider } from '../state/AuthProvider.jsx';

export function App() {
  return (
    <AuthProvider>
      <AppShell>
        <AppRoutes />
      </AppShell>
    </AuthProvider>
  );
}
