import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function Header(): JSX.Element {
  const { email, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
        <h1 className="text-lg font-semibold tracking-tight">Timesheet</h1>
        <nav className="flex items-center gap-1 text-sm" aria-label="Primary">
          {[
            { to: '/', label: 'Dashboard' },
            { to: '/entry', label: 'Entry' },
            { to: '/settings', label: 'Settings' },
          ].map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-fg'
                    : 'text-fg hover:bg-surface-2'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted hidden sm:inline" title={email ?? ''}>
            {email}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm hover:bg-border"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" aria-hidden />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
