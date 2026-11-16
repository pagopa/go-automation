/**
 * Formats a date as a human-readable UTC date and time.
 *
 * @param value - Date instance or date string accepted by the native Date parser
 * @returns UTC date and time in `dd/MM/yyyy HH.mm.ss` format, or `Invalid DateTime`
 * for an invalid value
 */
export function formatUtcDateTime(value: string | Date): string {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid DateTime';

  const day = padTwoDigits(date.getUTCDate());
  const month = padTwoDigits(date.getUTCMonth() + 1);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const hours = padTwoDigits(date.getUTCHours());
  const minutes = padTwoDigits(date.getUTCMinutes());
  const seconds = padTwoDigits(date.getUTCSeconds());

  return `${day}/${month}/${year} ${hours}.${minutes}.${seconds}`;
}

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}
