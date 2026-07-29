/**
 * Parses UTC date strings of formats 'YYYY-MM-DD HH:MM:SS' or standard ISO 8601 into a Date object.
 */
export function parseUtcDate(dateStr: string): Date {
  const trimmed = dateStr.trim();
  if (trimmed.includes('T') || trimmed.endsWith('Z')) {
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Invalid date string: ${dateStr}`);
    }
    return d;
  }
  // YYYY-MM-DD HH:MM:SS -> replace space with T and append Z to force UTC parsing
  const formatted = `${trimmed.replace(' ', 'T')}Z`;
  const d = new Date(formatted);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return d;
}
