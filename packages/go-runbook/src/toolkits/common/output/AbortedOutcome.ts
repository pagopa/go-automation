export interface AbortedOutcome {
  readonly kind: 'aborted';
  readonly reason?: string;
  readonly message: string;
}
