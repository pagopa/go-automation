export interface FailedOutcome {
  readonly kind: 'failed';
  readonly reason?: string;
  readonly failedStepId?: string;
  readonly error?: string;
  readonly message: string;
}
