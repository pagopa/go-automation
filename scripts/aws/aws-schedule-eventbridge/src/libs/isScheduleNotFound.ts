/**
 * Recognises the one Scheduler error that is drift rather than a failure.
 */

import { Core } from '@go-automation/go-common';

/** The error name EventBridge Scheduler uses for a schedule that does not exist */
const NOT_FOUND_ERROR_NAME = 'ResourceNotFoundException';

/**
 * Tells a missing schedule apart from any other read failure.
 *
 * An account that simply does not declare the schedule is reported as drift and
 * does not fail the sweep, so this distinction decides the exit code.
 *
 * @param error - The caught error of unknown type
 * @returns True when the error says the schedule does not exist
 */
export function isScheduleNotFound(error: unknown): boolean {
  return Core.hasErrorName(error, NOT_FOUND_ERROR_NAME);
}
