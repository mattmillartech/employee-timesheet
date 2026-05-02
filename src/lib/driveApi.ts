import { SheetsApiError } from './sheetsApi';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

/**
 * Name of the cross-device prefs file. Lives in the user's Drive root,
 * scoped to this OAuth client via `drive.file`. Acts as the source of
 * truth for "which sheet does this account use" — every signed-in browser
 * reads it on bootstrap, so two devices on the same Google account always
 * converge on the same sheet without having to share localStorage.
 */
const PREFS_FILE_NAME = 'employee-timesheet-prefs.json';
const PREFS_MIME = 'application/json';

export type AppPrefs = {
  sheetId?: string;
};

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

/**
 * Read the app's prefs file from the signed-in user's Drive. Returns
 * `null` if no prefs file has ever been created. The `fileId` is the
 * Drive file ID of the prefs file, needed to PATCH it on the next write
 * (creating a fresh file every time would litter the user's Drive).
 *
 * Cross-device correctness: both browsers signed in to the same Google
 * account hit this same file (drive.file scope = files this OAuth client
 * created or opened, and the file IS created by this client). One source
 * of truth, no localStorage divergence.
 */
export async function readAppPrefs(
  token: string,
): Promise<{ prefs: AppPrefs; fileId: string } | null> {
  const q = encodeURIComponent(
    `name='${PREFS_FILE_NAME}' and mimeType='${PREFS_MIME}' and trashed=false`,
  );
  const fields = encodeURIComponent('files(id,name,modifiedTime)');
  const path = `/files?q=${q}&fields=${fields}&pageSize=10&spaces=drive&orderBy=modifiedTime desc`;
  const data = await driveFetch<{ files?: { id: string; name: string }[] }>(path, token);
  const file = data.files?.[0];
  if (!file) return null;
  // Fetch the file body. `cache: 'no-store'` matches the rest of the app's
  // mutation-adjacent reads — we don't want a stale prefs body served from
  // disk cache after another device just updated it.
  const res = await fetch(`${DRIVE_API_BASE}/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    // File exists but we can't read it. Return the fileId so a subsequent
    // write PATCHes it instead of creating a duplicate.
    return { prefs: {}, fileId: file.id };
  }
  const text = await res.text();
  if (!text) return { prefs: {}, fileId: file.id };
  try {
    return { prefs: JSON.parse(text) as AppPrefs, fileId: file.id };
  } catch {
    // Malformed body — treat as empty prefs but keep the fileId so we
    // overwrite cleanly next time.
    return { prefs: {}, fileId: file.id };
  }
}

/**
 * Write the app's prefs file. If `existingFileId` is provided we PATCH it
 * (in place, preserving the same Drive file across writes); otherwise we
 * create a fresh file in the user's Drive root via multipart upload.
 *
 * Returns the file ID — caller should hold onto it to avoid creating a
 * duplicate prefs file on every save.
 */
export async function writeAppPrefs(
  token: string,
  prefs: AppPrefs,
  existingFileId?: string,
): Promise<string> {
  const body = JSON.stringify(prefs);
  if (existingFileId) {
    const url = `${DRIVE_UPLOAD_BASE}/files/${existingFileId}?uploadType=media`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': PREFS_MIME,
      },
      body,
      cache: 'no-store',
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new SheetsApiError(
        res.status,
        `Drive prefs PATCH failed: ${errText.slice(0, 200) || res.status}`,
      );
    }
    return existingFileId;
  }
  // Multipart create — metadata + body in a single request.
  const boundary = `boundary-${Math.random().toString(36).slice(2)}`;
  const metadata = { name: PREFS_FILE_NAME, mimeType: PREFS_MIME };
  const multipart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${PREFS_MIME}\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}--`;
  const res = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipart,
      cache: 'no-store',
    },
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new SheetsApiError(
      res.status,
      `Drive prefs create failed: ${errText.slice(0, 200) || res.status}`,
    );
  }
  const created = (await res.json()) as { id?: string };
  if (!created.id) {
    throw new SheetsApiError(500, 'Drive prefs create returned no id');
  }
  return created.id;
}
