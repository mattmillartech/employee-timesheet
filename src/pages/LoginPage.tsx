import { useAuth } from '@/contexts/AuthContext';
import { ENV } from '@/lib/constants';

export function LoginPage(): JSX.Element {
  const { status, error, signIn } = useAuth();
  const configMissing = !ENV.googleClientId;

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg text-fg font-sans">
      <div className="max-w-md w-full px-6 py-10 rounded-2xl bg-surface border border-border shadow-sm space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Employee Timesheet</h1>
          <p className="text-sm text-muted">
            Sign in with the authorized Google account to continue.
          </p>
        </header>

        {configMissing ? (
          <div className="p-4 rounded-md border border-danger/40 bg-danger/10 text-sm">
            <p className="font-medium text-danger">Configuration missing</p>
            <p className="mt-1 text-fg/80">
              <code>VITE_GOOGLE_CLIENT_ID</code> is not set on this build.
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={signIn}
          disabled={status === 'signing-in' || configMissing}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-fg px-4 py-2.5 font-medium hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {status === 'signing-in' ? 'Opening Google sign-in…' : 'Sign in with Google'}
        </button>

        {status === 'unauthorized' ? (
          <div className="p-4 rounded-md border border-danger/40 bg-danger/10 text-sm">
            <p className="font-medium text-danger">Unauthorized</p>
            <p className="mt-1 text-fg/80">
              This account isn't on the allowlist. Allowed:{' '}
              <code>{ENV.allowedGoogleEmails.join(', ')}</code>.
            </p>
          </div>
        ) : null}

        {status === 'error' && error ? (
          <div className="p-4 rounded-md border border-danger/40 bg-danger/10 text-sm">
            <p className="font-medium text-danger">Sign-in failed</p>
            <p className="mt-1 text-fg/80 break-words">{error}</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
