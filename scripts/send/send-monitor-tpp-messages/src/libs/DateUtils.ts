/**
 * Date Utilities
 * Helper functions for date formatting and manipulation
 */

/**
 * Formats a date for use in Athena queries
 * @param date - Date to format
 * @returns Formatted date string (yyyy-MM-dd HH:mm:ss)
 */
export function formatDateForAthena(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Extracts date components for use in Athena partition queries
 * @param date - Date to extract components from
 * @returns Object containing year, month, day, and hour as zero-padded strings
 */
export function getDateComponents(date: Date): {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly hour: string;
} {
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    day: String(date.getDate()).padStart(2, '0'),
    hour: String(date.getHours()).padStart(2, '0'),
  };
}

/**
 * Parses a date string into a Date object
 * Supports ISO 8601, date-only, and Unix timestamp formats
 * @param dateString - Date string to parse
 * @returns Parsed Date object
 * @throws Error if date format is invalid
 */
export function parseDateTime(dateString: string): Date {
  // Try parsing as Unix timestamp
  if (/^\d+$/.test(dateString)) {
    const timestamp = parseInt(dateString, 10);
    return new Date(timestamp * 1000);
  }

  // Try parsing as ISO or standard date format
  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateString}`);
  }

  return date;
}

/**
 * Calculates a date that is a specified number of hours ago
 * @param hours - Number of hours to subtract
 * @returns Date object representing the past time
 */
export function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}
