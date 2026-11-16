/** How much of a successful step's collected evidence reaches the occurrence. */
type EvidenceRetention =
  // Use for queries that already reject incomplete/capped results.
  { readonly mode: 'all' } | { readonly mode: 'latest'; readonly limit: number; readonly timestampField: string };

interface StepEvidenceBase {
  readonly id: string;
  readonly label: string;
  readonly retention: EvidenceRetention;
  /** Split outputs containing multiple query result sets without losing provenance. */
  readonly filter?: { readonly field: string; readonly equals: string };
}

/** Declared on the producing step descriptor; sourceStep is derived, never repeated. */
export type StepEvidence =
  | (StepEvidenceBase & {
      readonly type: 'log-sample';
      /** Message aliases in priority order. Defaults to @message, message, log. */
      readonly messageFields?: ReadonlyArray<string>;
    })
  | (StepEvidenceBase & { readonly type: 'step-output' });
