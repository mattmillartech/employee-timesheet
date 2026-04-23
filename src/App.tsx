import { Routes, Route } from 'react-router-dom';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route
        path="*"
        element={
          <main className="min-h-screen bg-surface text-fg flex items-center justify-center font-sans">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold">Employee Timesheet</h1>
              <p className="text-muted">
                Scaffolding in place. Sign-in and data layer arrive in M2.
              </p>
            </div>
          </main>
        }
      />
    </Routes>
  );
}
