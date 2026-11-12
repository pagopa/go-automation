/**
 * Output column names for the identifiers produced by the run. A name that
 * already exists in the input is filled in place (§7.3).
 */
export interface MappingOutputColumns {
  /** Default `iun`. */
  readonly iun?: string;
  /** Default `requestId`. */
  readonly requestId?: string;
}
