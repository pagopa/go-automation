/**
 * GOScript Default Configuration
 * Contains default values and constants used by GOScript
 */

/**
 * Default options for AWS credentials manager
 */
export const defaultAwsCredentialsOptions = {
  autoLogin: true,
  interactive: true,
  maxRetries: 1,
  loginTimeout: 120000,
} as const;

/**
 * Table column widths for configuration display
 * cli-table3 adds padding (1 space on each side), so content width is colWidth - padding
 */
export const configTableWidths = {
  parameterWidth: 24,
  valueWidth: 50,
  sourceWidth: 50,
  padding: 2,
} as const;
