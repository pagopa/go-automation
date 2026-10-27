/**
 * Data structure for Slack report messages
 */
export interface ReportData {
  readonly startDate: string;
  readonly endDate: string;
  readonly rowCount: number;
  readonly fileName: string;
  readonly analysis: string;
  readonly timestamp: string;
  readonly [key: string]: string | number;
}
