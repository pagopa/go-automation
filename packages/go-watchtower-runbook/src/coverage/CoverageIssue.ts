/**
 * Single coverage finding.
 *
 * `ERROR` is reserved for conditions that would make an apply `BLOCKED` or the
 * runbook → product map false; everything else is drift and stays a `WARNING`.
 */
export interface CoverageIssue {
  readonly severity: 'ERROR' | 'WARNING';
  readonly code: CoverageIssueCode;
  readonly runbookKey?: string;
  readonly knownCaseId?: string;
  readonly product?: string;
  readonly field?: string;
  readonly declaredValue?: string;
  /** Case-insensitive near miss; only ever a hint, never an automatic match. */
  readonly suggestedValue?: string;
  readonly message: string;
}

/** Blocking codes: each one maps to an apply that would be refused. */
export const COVERAGE_ERROR_CODES = {
  ALARM_PRODUCT_AMBIGUOUS: 'ALARM_PRODUCT_AMBIGUOUS',
  ALARM_PRODUCT_MISMATCH: 'ALARM_PRODUCT_MISMATCH',
  PRODUCT_CENSUS_MISSING: 'PRODUCT_CENSUS_MISSING',
  PRODUCT_MAPPING_CONFLICT: 'PRODUCT_MAPPING_CONFLICT',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_TYPE_MISMATCH: 'RESOURCE_TYPE_MISMATCH',
  DOWNSTREAM_NOT_FOUND: 'DOWNSTREAM_NOT_FOUND',
  FINAL_ACTION_NOT_FOUND: 'FINAL_ACTION_NOT_FOUND',
  IGNORE_REASON_NOT_FOUND: 'IGNORE_REASON_NOT_FOUND',
  IGNORE_DETAILS_INVALID: 'IGNORE_DETAILS_INVALID',
  IGNORE_DETAILS_SCHEMA_INVALID: 'IGNORE_DETAILS_SCHEMA_INVALID',
} as const;

/** Drift codes: visible, but they never block the rollout on their own. */
export const COVERAGE_WARNING_CODES = {
  // A runbook may legitimately handle alarms Watchtower does not censure: without
  // an AlarmEvent no automatic execution exists, so no apply can be blocked.
  ALARM_NOT_CENSUSED: 'ALARM_NOT_CENSUSED',
  CATALOG_VALUE_NOT_CENSUSED: 'CATALOG_VALUE_NOT_CENSUSED',
  CENSUS_VALUE_NOT_CATALOGUED: 'CENSUS_VALUE_NOT_CATALOGUED',
  CENSUS_NAME_TOO_LONG: 'CENSUS_NAME_TOO_LONG',
  RUNBOOK_DOCUMENT_NOT_FOUND: 'RUNBOOK_DOCUMENT_NOT_FOUND',
} as const;

export type CoverageIssueCode =
  | (typeof COVERAGE_ERROR_CODES)[keyof typeof COVERAGE_ERROR_CODES]
  | (typeof COVERAGE_WARNING_CODES)[keyof typeof COVERAGE_WARNING_CODES];
