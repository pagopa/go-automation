export interface ProcedureFailureOutcome {
  readonly kind: 'procedure-failure';
  readonly summary: string;
  readonly failedStepId?: string;
  readonly error?: string;
  readonly metrics?: Readonly<Record<string, number | string>>;
}
