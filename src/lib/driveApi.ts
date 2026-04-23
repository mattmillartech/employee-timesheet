import { SheetsApiError } from './sheetsApi';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

type DriveFile = {
  id: string;
  name: string;
  createdTime: string;
  mimeType: string;
  trashed?: boolean;
};

async function driveFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${DRIVE_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const bodyText = await response.text();
  let parsed: unknown = null;
  if (bodyText) {
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = bodyText;
    }
  }
  if (!response.ok) {
    const message =
      (typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as { error?: { message?: string } }).error?.message) ||
      `Drive API ${response.status}`;
    throw new SheetsApiError(response.status, message, parsed);
  }
  return parsed as T;
}

/**
 * List spreadsheets that THIS OAuth client has created or been granted access
 * to for the signed-in user (scope `drive.file`). This is the primitive that
 * makes cross-device sheet discovery work — any device signing in with the
 * same OAuth client sees the same list.
 *
 * Returns entries sorted by createdTime ascending (oldest first), excluding
 * trashed files. Use the first entry as the "canonical" timesheet for the
 * user unless they've explicitly pointed at a different one.
 */
export async function listAppTimesheets(token: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(
    `mimeType='${SPREADSHEET_MIME}' and trashed=false`,
  );
  const fields = encodeURIComponent('files(id,name,createdTime,mimeType,trashed)');
  const path = `/files?q=${q}&fields=${fields}&orderBy=createdTime&pageSize=50&spaces=drive`;
  const data = await driveFetch<{ files?: DriveFile[] }>(path, token);
  return data.files ?? [];
}
