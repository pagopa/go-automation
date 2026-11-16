export type RunbookOutcome =
  | KnownCaseMatchedOutcome
  | UnknownCaseOutcome
  | ProcedureSuccessOutcome
  | ProcedureFailureOutcome
  | FailedOutcome
  | AbortedOutcome;

export interface KnownCaseMatchedOutcome {
  readonly kind: 'known-case-matched';
  readonly primaryCaseId: string;
  readonly primaryCaseDescription: string;
  readonly matchedCases: ReadonlyArray<{
    readonly id: string;
    readonly description: string;
    readonly priority: number;
    readonly resolvedMessage?: string;
  }>;
  readonly message: string;
}

export interface UnknownCaseOutcome {
  readonly kind: 'unknown-case';
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
