/**
 * Keyword tokens that flag an application log message as error-like when the
 * row has no `level` field. Includes the Lambda runtime markers of `REPORT`
 * lines (`Status: timeout`, `Status: error`).
 */
export const ERROR_KEYWORDS: ReadonlyArray<string> = [
  'Exception',
  'Error',
  'failed',
  'FAILURE',
  'Status: timeout',
  'Status: error',
];
