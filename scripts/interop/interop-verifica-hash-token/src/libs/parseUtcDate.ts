/**
 * Parses UTC date strings of formats 'YYYY-MM-DD HH:MM:SS' or standard ISO 8601 into a Date object.
 */
export function parseUtcDate(dateStr: string): Date {
  const trimmed = dateStr.trim();
  let normalized: string;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    normalized = `${trimmed}T00:00:00Z`;
  } else if (trimmed.includes('T')) {
    normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed) ? trimmed : `${trimmed}Z`;
  } else {
    normalized = `${trimmed.replace(' ', 'T')}Z`;
  }

  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return d;
}
