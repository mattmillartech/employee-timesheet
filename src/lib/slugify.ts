/**
 * Convert a display name to a tabName slug for the Google Sheet.
 *   "Jane Smith"  → "jane-smith"
 *   "Álvaro O'Brien" → "alvaro-obrien"
 *   "  Bob   " → "bob"
 */
export function slugify(input: string): string {
  return input
    .trim()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/['’]/g, '') // drop straight and curly apostrophes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
