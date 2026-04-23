import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from './contexts/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { EntryPage } from './pages/EntryPage';
import { SettingsPage } from './pages/SettingsPage';

export function App(): JSX.Element {
  const { status } = useAuth();

  if (status === 'bootstrapping') {
    return (
      <main className="min-h-screen bg-bg text-fg flex items-center justify-center font-sans">
        <p className="text-muted">Loading…</p>
      </main>
    );
  }

  if (status !== 'signed-in') {
    return (
      <>
        <LoginPage />
        <Toaster position="top-right" richColors closeButton />
      </>
    );
  }

  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/entry" element={<EntryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
