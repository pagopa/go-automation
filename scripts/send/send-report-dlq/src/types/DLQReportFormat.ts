/**
 * Supported output formats for the DLQ report
 */
export type DLQReportFormat = 'json' | 'csv' | 'html';

/** All valid format values */
export const DLQ_REPORT_FORMATS: ReadonlyArray<DLQReportFormat> = ['json', 'csv', 'html'];

/**
 * Type guard for DLQReportFormat
 *
 * @param value - String to check
 * @returns True if the value is a valid DLQReportFormat
 */
export function isDLQReportFormat(value: string): value is DLQReportFormat {
  return (DLQ_REPORT_FORMATS as ReadonlyArray<string>).includes(value);
}
