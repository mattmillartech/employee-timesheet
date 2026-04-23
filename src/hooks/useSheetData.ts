import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SheetsApiError } from '@/lib/sheetsApi';

/**
 * Returns a runner that calls `op(token)` with a valid access token, and
 * on 401 silently refreshes + retries once. Use this to wrap every
 * Sheets API call in the app so token expiry is invisible to the user.
 */
export function useSheetRunner(): <T>(op: (token: string) => Promise<T>) => Promise<T> {
  const { getToken } = useAuth();

  return useCallback(
    async <T,>(op: (token: string) => Promise<T>): Promise<T> => {
      const token = await getToken();
      try {
        return await op(token);
      } catch (err) {
        if (err instanceof SheetsApiError && err.status === 401) {
          const fresh = await getToken({ forceRefresh: true });
          return await op(fresh);
        }
        throw err;
      }
    },
    [getToken],
  );
}
