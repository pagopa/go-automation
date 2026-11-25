/** No case matched, and the evidence is complete. */
export interface UnknownCaseOutcome {
  readonly kind: 'unknown-case';
  readonly casesEvaluated: number;
  readonly fallbackMessage?: string;
  readonly message: string;
}
