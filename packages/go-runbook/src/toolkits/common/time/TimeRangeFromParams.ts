/**
 * Configuration for mapping time range boundaries to context parameter names.
 */
export interface TimeRangeFromParams {
  /** Parameter name containing the ISO start date */
  readonly start: string;
  /** Parameter name containing the ISO end date */
  readonly end: string;
}
