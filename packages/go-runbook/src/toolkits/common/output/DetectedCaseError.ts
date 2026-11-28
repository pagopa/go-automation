import type { KnownErrorDetectionOutput } from './KnownErrorDetectionOutput.js';

/** The detection of one error, with the identity of the error, before it joins the occurrence of its case. */
export interface DetectedCaseError {
  readonly output: KnownErrorDetectionOutput;
  readonly errorKey: string;
  readonly inTree: boolean;
}
