import type { PresetBuildSuccess } from './PresetBuildSuccess.js';
import type { RecordBuildFailure } from './RecordBuildFailure.js';

/**
 * Outcome of `buildPreset`: the identifiers of a row already sent, or the issues.
 */
export type PresetBuildResult = PresetBuildSuccess | RecordBuildFailure;
