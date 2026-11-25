import type { StepEvidenceBase } from './StepEvidenceBase.js';

/** Declared on the producing step descriptor; sourceStep is derived, never repeated. */
export type StepEvidence =
  | (StepEvidenceBase & {
      readonly type: 'log-sample';
      /** Message aliases in priority order. Defaults to @message, message, log. */
      readonly messageFields?: ReadonlyArray<string>;
    })
  | (StepEvidenceBase & { readonly type: 'step-output' });
