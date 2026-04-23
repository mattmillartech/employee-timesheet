import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ENV, SCOPES, TOKEN_EXPIRY_BUFFER_MS } from '@/lib/constants';
import { fetchUserInfo } from '@/lib/sheetsApi';

export type AuthStatus =
  | 'bootstrapping'
  | 'signed-out'
  | 'signing-in'
  | 'signed-in'
  | 'unauthorized'
  | 'error';

export type AuthState = {
  status: AuthStatus;
  email: string | null;
  /** Millisecond epoch at which the current access token expires. */
  expiresAt: number | null;
  error: string | null;
};

type AuthContextValue = AuthState & {
  signIn: () => void;
  signOut: () => void;
  /**
   * Returns a valid access token. If the current one is expired or missing,
   * silently refreshes via GIS `prompt: ''`. Throws if the user is not signed in.
   */
  getToken: (opts?: { forceRefresh?: boolean }) => Promise<string>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function waitForGis(): Promise<NonNullable<Window['google']>> {
  const existing = window.google;
  if (existing?.accounts?.oauth2) return existing;
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 10_000;
    const tick = (): void => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error('Google Identity Services failed to load within 10s'));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<AuthState>({
    status: 'bootstrapping',
    email: null,
    expiresAt: null,
    error: null,
  });

  // In-memory only (per spec — no localStorage/sessionStorage for auth state).
  const tokenRef = useRef<string | null>(null);
  const tokenExpiresAtRef = useRef<number | null>(null);
  const tokenClientRef = useRef<GisTokenClient | null>(null);
  const pendingResolveRef = useRef<((token: string) => void) | null>(null);
  const pendingRejectRef = useRef<((err: Error) => void) | null>(null);

  const initTokenClient = useCallback(async (): Promise<GisTokenClient> => {
    if (tokenClientRef.current) return tokenClientRef.current;
    const google = await waitForGis();
    if (!ENV.googleClientId) {
      throw new Error('VITE_GOOGLE_CLIENT_ID is not set');
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: ENV.googleClientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          const err = new Error(response.error);
          pendingRejectRef.current?.(err);
          pendingRejectRef.current = null;
          pendingResolveRef.current = null;
          setState((prev) => ({ ...prev, status: 'error', error: response.error ?? 'auth error' }));
          return;
        }
        tokenRef.current = response.access_token;
        tokenExpiresAtRef.current = Date.now() + response.expires_in * 1000;
        pendingResolveRef.current?.(response.access_token);
        pendingResolveRef.current = null;
        pendingRejectRef.current = null;
      },
      error_callback: (err) => {
        pendingRejectRef.current?.(new Error(err.message || err.type || 'auth error'));
        pendingRejectRef.current = null;
        pendingResolveRef.current = null;
        setState((prev) => ({ ...prev, status: 'error', error: err.message || err.type }));
      },
    });
    tokenClientRef.current = client;
    return client;
  }, []);

  const requestToken = useCallback(
    async (prompt: '' | 'consent'): Promise<string> => {
      const client = await initTokenClient();
      return new Promise((resolve, reject) => {
        pendingResolveRef.current = resolve;
        pendingRejectRef.current = reject;
        client.requestAccessToken({ prompt });
      });
    },
    [initTokenClient],
  );

  const signIn = useCallback((): void => {
    setState((prev) => ({ ...prev, status: 'signing-in', error: null }));
    void (async () => {
      try {
        const token = await requestToken('consent');
        const userinfo = await fetchUserInfo(token);
        const email = (userinfo.email ?? '').toLowerCase();
        if (!ENV.allowedGoogleEmail) {
          setState({
            status: 'error',
            email,
            expiresAt: tokenExpiresAtRef.current,
            error: 'VITE_ALLOWED_GOOGLE_EMAIL is not set in the build',
          });
          return;
        }
        if (email !== ENV.allowedGoogleEmail) {
          // Revoke the token — user is not authorized.
          if (window.google && tokenRef.current) {
            window.google.accounts.oauth2.revoke(tokenRef.current, () => undefined);
          }
          tokenRef.current = null;
          tokenExpiresAtRef.current = null;
          setState({ status: 'unauthorized', email, expiresAt: null, error: null });
          return;
        }
        setState({
          status: 'signed-in',
          email,
          expiresAt: tokenExpiresAtRef.current,
          error: null,
        });
      } catch (err) {
        setState({
          status: 'error',
          email: null,
          expiresAt: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, [requestToken]);

  const signOut = useCallback((): void => {
    const token = tokenRef.current;
    if (token && window.google) {
      window.google.accounts.oauth2.revoke(token, () => undefined);
    }
    tokenRef.current = null;
    tokenExpiresAtRef.current = null;
    setState({ status: 'signed-out', email: null, expiresAt: null, error: null });
  }, []);

  const getToken = useCallback(
    async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}): Promise<string> => {
      const token = tokenRef.current;
      const expiresAt = tokenExpiresAtRef.current;
      const stillValid =
        token !== null && expiresAt !== null && expiresAt - TOKEN_EXPIRY_BUFFER_MS > Date.now();
      if (!forceRefresh && stillValid) return token;
      // Silent refresh — user already consented to the scope, no popup.
      const fresh = await requestToken('');
      setState((prev) => ({ ...prev, expiresAt: tokenExpiresAtRef.current }));
      return fresh;
    },
    [requestToken],
  );

  useEffect(() => {
    // Don't attempt silent sign-in on load — user must explicitly click the
    // sign-in button. Just mark bootstrapping done.
    setState((prev) =>
      prev.status === 'bootstrapping' ? { ...prev, status: 'signed-out' } : prev,
    );
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signOut, getToken }),
    [state, signIn, signOut, getToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
