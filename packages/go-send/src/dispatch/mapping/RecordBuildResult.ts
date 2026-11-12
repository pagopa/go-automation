import type { RecordBuildFailure } from './RecordBuildFailure.js';
import type { RecordBuildSuccess } from './RecordBuildSuccess.js';

/**
 * Outcome of `buildRecord`: a valid record, or the list of issues.
 */
export type RecordBuildResult = RecordBuildSuccess | RecordBuildFailure;
