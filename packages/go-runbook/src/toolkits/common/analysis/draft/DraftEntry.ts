import type { KnownErrorDetection } from '../../../../engine/index.js';
import type { KnownErrorAnalysis } from '../KnownErrorAnalysis.js';

/** An annotated detection with the texts it contributes to the draft. */
export interface DraftEntry {
  readonly detection: KnownErrorDetection;
  readonly analysis: KnownErrorAnalysis;
  readonly resolution: string;
}
