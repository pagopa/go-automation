/**
 * Technical outcome of a Lambda alarm runbook, recorded in
 * `vars.terminationReason` and rendered by the closing summary.
 */
export type TerminationReason =
  | 'known-case' // a known case matched
  | 'downstream' // the error points to a downstream microservice
  | 'no-errors' // the error scan returned no rows
  | 'no-match'; // errors found but no known case matched
