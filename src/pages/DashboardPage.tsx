import { useSheet } from '@/contexts/SheetContext';

export function DashboardPage(): JSX.Element {
  const { status, error, employees, settings } = useSheet();

  if (status === 'loading') {
    return (
      <section className="p-6">
        <p className="text-muted">Loading sheet data…</p>
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section className="p-6">
        <div className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm">
          <p className="font-medium text-danger">Couldn't load sheet</p>
          <p className="mt-1 text-fg/80">{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="p-6 space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <p className="text-muted text-sm">
          Full filters + week-detail view arrive in M4. Showing bootstrap state.
        </p>
      </header>

      <div className="rounded-md border border-border p-4 bg-surface space-y-2 text-sm">
        <p>
          <span className="text-muted">Timezone:</span>{' '}
          <span className="font-mono">{settings.timezone}</span>
        </p>
        <p>
          <span className="text-muted">Display mode:</span>{' '}
          <span className="font-mono">{settings.displayMode}</span>
        </p>
        <p>
          <span className="text-muted">Employees loaded:</span>{' '}
          <span className="font-mono">{employees.length}</span>{' '}
          <span className="text-muted">
            ({employees.filter((e) => e.active).length} active)
          </span>
        </p>
        {employees.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {employees.map((e) => (
              <li key={e.tabName} className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    e.active ? 'bg-success' : 'bg-muted/60'
                  }`}
                />
                <span>{e.displayName}</span>
                <span className="text-muted text-xs">({e.tabName})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No employees in `_Config` yet — add one in Settings.</p>
        )}
      </div>
    </section>
  );
}
