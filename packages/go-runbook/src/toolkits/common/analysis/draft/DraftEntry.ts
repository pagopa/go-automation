import type { KnownCaseDetection } from '../../../../engine/index.js';
import type { KnownCaseAnalysis } from '../KnownCaseAnalysis.js';

/** An annotated detection with the texts it contributes to the draft. */
export interface DraftEntry {
  readonly detection: KnownCaseDetection;
  readonly analysis: KnownCaseAnalysis;
  readonly resolution: string;
}
