/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_ALLOWED_GOOGLE_EMAIL: string;
  readonly VITE_SHEET_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Google Identity Services — minimal types we actually use.
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GisTokenResponse) => void;
            error_callback?: (err: GisTokenError) => void;
            prompt?: '' | 'consent' | 'select_account';
          }) => GisTokenClient;
          revoke: (accessToken: string, done?: () => void) => void;
          hasGrantedAllScopes: (tokenResponse: GisTokenResponse, ...scopes: string[]) => boolean;
        };
      };
    };
  }

  type GisTokenResponse = {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    scope: string;
    error?: string;
  };

  type GisTokenError = {
    type: string;
    message: string;
  };

  type GisTokenClient = {
    requestAccessToken: (overrideConfig?: { prompt?: '' | 'consent' | 'select_account' }) => void;
  };
}

export {};
