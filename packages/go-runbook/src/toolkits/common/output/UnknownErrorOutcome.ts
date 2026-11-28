/** No case matched, and the evidence is complete. */
export interface UnknownErrorOutcome {
  readonly kind: 'unknown-error';
  readonly casesEvaluated: number;
  readonly fallbackMessage?: string;
  readonly message: string;
}
