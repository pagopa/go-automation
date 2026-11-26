/** No case matched, and the evidence is incomplete: a failed, skipped or saturated read. */
export interface InconclusiveOutcome {
  readonly kind: 'inconclusive';
  readonly casesEvaluated: number;
  readonly fallbackMessage?: string;
  readonly message: string;
}
