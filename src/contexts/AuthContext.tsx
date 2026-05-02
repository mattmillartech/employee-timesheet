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
import {
  ENV,
  LOCALSTORAGE_AUTH_SESSION_KEY,
  SCOPES,
  TOKEN_EXPIRY_BUFFER_MS,
} from '@/lib/constants';
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

type StoredSession = {
  email: string;
  token: string;
  expiresAt: number;
};

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.email === 'string' &&
      typeof parsed.token === 'string' &&
      typeof parsed.expiresAt === 'number'
    ) {
      return { email: parsed.email, token: parsed.token, expiresAt: parsed.expiresAt };
    }
  } catch {
    // malformed blob — fall through to null
  }
  return null;
}

function writeStoredSession(session: StoredSession): void {
  try {
    localStorage.setItem(LOCALSTORAGE_AUTH_SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage might be disabled; silent-fail is fine.
  }
}

function clearStoredSession(): void {
  try {
    localStorage.removeItem(LOCALSTORAGE_AUTH_SESSION_KEY);
  } catch {
    // ignore
  }
}

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

  // Persisted across reloads via localStorage (writes happen on every token
  // update + sign-in, cleared on signOut). See writeStoredSession below.
  const tokenRef = useRef<string | null>(null);
  const tokenExpiresAtRef = useRef<number | null>(null);
  const emailRef = useRef<string | null>(null);
  const tokenClientRef = useRef<GisTokenClient | null>(null);
  const pendingResolveRef = useRef<((token: string) => void) | null>(null);
  const pendingRejectRef = useRef<((err: Error) => void) | null>(null);

  const persistCurrent = useCallback((): void => {
    if (tokenRef.current && tokenExpiresAtRef.current && emailRef.current) {
      writeStoredSession({
        email: emailRef.current,
        token: tokenRef.current,
        expiresAt: tokenExpiresAtRef.current,
      });
    }
  }, []);

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
        persistCurrent();
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
  }, [persistCurrent]);

  const requestToken = useCallback(
    async (prompt: '' | 'consent'): Promise<string> => {
      const client = await initTokenClient();
      return new Promise((resolve, reject) => {
        pendingResolveRef.current = resolve;
        pendingRejectRef.current = reject;
        // `hint` pre-fills the account so multi-account users don't get an
        // account picker on silent refresh — without it, GIS often prompts
        // even with prompt: '' once the previous access token expires.
        const config: { prompt: '' | 'consent'; hint?: string } = { prompt };
        if (emailRef.current) config.hint = emailRef.current;
        client.requestAccessToken(config);
      });
    },
    [initTokenClient],
  );

  const completeSignIn = useCallback(
    async (token: string, expiresAt: number): Promise<void> => {
      // Verify email allowlist via userinfo.
      const userinfo = await fetchUserInfo(token);
      const email = (userinfo.email ?? '').toLowerCase();
      // Empty allowlist = any Google account that passed GCP OAuth can sign
      // in; non-empty = strict allowlist match required.
      const hasAllowlist = ENV.allowedGoogleEmails.length > 0;
      const allowed = !hasAllowlist || ENV.allowedGoogleEmails.includes(email);
      if (!allowed) {
        if (window.google && tokenRef.current) {
          window.google.accounts.oauth2.revoke(tokenRef.current, () => undefined);
        }
        tokenRef.current = null;
        tokenExpiresAtRef.current = null;
        emailRef.current = null;
        clearStoredSession();
        setState({ status: 'unauthorized', email, expiresAt: null, error: null });
        return;
      }
      emailRef.current = email;
      persistCurrent();
      setState({ status: 'signed-in', email, expiresAt, error: null });
    },
    [persistCurrent],
  );

  const signIn = useCallback((): void => {
    setState((prev) => ({ ...prev, status: 'signing-in', error: null }));
    void (async () => {
      try {
        const token = await requestToken('consent');
        await completeSignIn(token, tokenExpiresAtRef.current ?? Date.now() + 3_600_000);
      } catch (err) {
        setState({
          status: 'error',
          email: null,
          expiresAt: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, [requestToken, completeSignIn]);

  const signOut = useCallback((): void => {
    const token = tokenRef.current;
    if (token && window.google) {
      window.google.accounts.oauth2.revoke(token, () => undefined);
    }
    tokenRef.current = null;
    tokenExpiresAtRef.current = null;
    emailRef.current = null;
    clearStoredSession();
    setState({ status: 'signed-out', email: null, expiresAt: null, error: null });
  }, []);

  const getToken = useCallback(
    async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}): Promise<string> => {
      const token = tokenRef.current;
      const expiresAt = tokenExpiresAtRef.current;
      const stillValid =
        token !== null && expiresAt !== null && expiresAt - TOKEN_EXPIRY_BUFFER_MS > Date.now();
      if (!forceRefresh && stillValid) return token;
      const fresh = await requestToken('');
      persistCurrent();
      setState((prev) => ({ ...prev, expiresAt: tokenExpiresAtRef.current }));
      return fresh;
    },
    [requestToken, persistCurrent],
  );

  // Bootstrap. Goal: a reload should NEVER bounce the user back to the GIS
  // consent flow if they have a stored session — that flow is long because
  // the OAuth client is unverified, and the maintainer reloads often.
  //
  // Strategy: optimistically restore from localStorage and mark the user
  // signed-in immediately. Skip the userinfo round-trip on bootstrap (the
  // allowlist was already enforced when they signed in originally; the
  // first real Sheets API call still 401s if the token's revoked). If the
  // stored token is past expiry, fire a silent refresh in the background —
  // hint-pre-filled to the cached email so GIS doesn't pop a picker. If
  // the silent refresh fails, the next API call's 401 path or an explicit
  // sign-out is what eventually clears the session, not bootstrap itself.
  useEffect(() => {
    let cancelled = false;
    const stored = readStoredSession();
    if (!stored) {
      setState({ status: 'signed-out', email: null, expiresAt: null, error: null });
      return;
    }
    tokenRef.current = stored.token;
    tokenExpiresAtRef.current = stored.expiresAt;
    emailRef.current = stored.email;
    setState({
      status: 'signed-in',
      email: stored.email,
      expiresAt: stored.expiresAt,
      error: null,
    });
    // If the access token is past its useful life, kick off a silent refresh
    // in the background. We don't block the UI on this — the user is already
    // viewing the app; the new token (or the failure to get one) just shows
    // up on the next API call via getToken's existing refresh path.
    const stillValid = stored.expiresAt - TOKEN_EXPIRY_BUFFER_MS > Date.now();
    if (!stillValid) {
      void (async () => {
        try {
          await requestToken('');
          if (cancelled) return;
          persistCurrent();
          setState((prev) => ({ ...prev, expiresAt: tokenExpiresAtRef.current }));
        } catch {
          // Silent refresh failed (Google session ended, consent revoked,
          // third-party cookies blocked, etc.). Leave the user "optimistically
          // signed in" — getToken will retry on the next API call and surface
          // a useful error if it really can't refresh. Forcing them out here
          // is the loop the user explicitly asked us to break.
        }
      })();
    }
    return () => {
      cancelled = true;
    };
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
