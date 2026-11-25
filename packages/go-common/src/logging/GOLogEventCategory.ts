/**
 * Log event categories
 * Defines the type/severity of log messages for visual differentiation
 */

export enum GOLogEventCategory {
  /** Plain text message without special formatting */
  TEXT = 'text',

  /** Standard log message for regular steps */
  STEP = 'step',

  /** Success message (green) */
  SUCCESS = 'success',

  /** Error message (red) */
  ERROR = 'error',

  /** Fatal message (red) */
  FATAL = 'fatal',

  /** Warning message (yellow) */
  WARNING = 'warning',

  /** Important header/title message */
  HEADER = 'header',

  /** Informative message */
  INFO = 'info',

  /** Section within a header */
  SECTION = 'section',
}
