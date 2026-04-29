import type { Core } from '@go-automation/go-common';

/** SQS hard limit for VisibilityTimeout (12 hours, in seconds) */
export const MAX_VISIBILITY_TIMEOUT_SECONDS = 43200;

/** SQS hard limit for batch size on Receive/Send/Delete operations */
export const MAX_BATCH_SIZE = 10;

/**
 * Builds a CLI parameter validator that accepts only positive integers (≥ 1).
 *
 * @param flag - Flag name shown in the error message (e.g. `'--limit'`)
 * @returns A validator usable in `GOConfigParameterOptions.validator`
 */
export const positiveIntegerValidator =
  (flag: string) =>
  (value: Core.GOConfigParameterValue): boolean | string =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1
      ? true
      : `Invalid ${flag}: ${String(value)}. Must be a positive integer.`;
