import type { IdentifierObservation } from '../../../engine/types/IdentifierObservation.js';

export type RunbookOutcome =
  | KnownCaseMatchedOutcome
  | UnknownCaseOutcome
  | InconclusiveOutcome
  | ProcedureSuccessOutcome
  | ProcedureFailureOutcome
  | FailedOutcome
  | AbortedOutcome;

export interface KnownCaseMatchedOutcome {
  readonly kind: 'known-case-matched';
  /** Every detection, in time order (declaration order on ties, untimed last). */
  readonly detections: ReadonlyArray<{
    readonly caseId: string;
    readonly description: string;
    readonly firstSeenAt?: string;
    readonly lastSeenAt?: string;
    readonly evidenceRows: number;
    readonly resolvedMessage?: string;
    readonly observations: ReadonlyArray<IdentifierObservation>;
  }>;
  readonly message: string;
}

/** No case matched, and the evidence is complete. */
export interface UnknownCaseOutcome {
  readonly kind: 'unknown-case';
  readonly casesEvaluated: number;
  readonly fallbackMessage?: string;
  readonly message: string;
}

/** No case matched, and the evidence is incomplete: a failed, skipped or saturated read. */
export interface InconclusiveOutcome {
  readonly kind: 'inconclusive';
  readonly casesEvaluated: number;
  readonly fallbackMessage?: string;
  readonly message: string;
}

export interface ProcedureSuccessOutcome {
  readonly kind: 'procedure-success';
  readonly summary: string;
  readonly metrics?: Readonly<Record<string, number | string>>;
}

export interface ProcedureFailureOutcome {
  readonly kind: 'procedure-failure';
  readonly summary: string;
  readonly failedStepId?: string;
  readonly error?: string;
  readonly metrics?: Readonly<Record<string, number | string>>;
}

export interface FailedOutcome {
  readonly kind: 'failed';
  readonly reason?: string;
  readonly failedStepId?: string;
  readonly error?: string;
  readonly message: string;
}

export interface AbortedOutcome {
  readonly kind: 'aborted';
  readonly reason?: string;
  readonly message: string;
}
