/**
 * Trace of case evaluation during known case matching.
 */
export interface CaseMatchingTrace {
  /** ID of the evaluated case */
  readonly caseId: string;
  /** Description of the case */
  readonly description: string;
  /** Priority of the case */
  readonly priority: number;
  /** Whether the condition matched */
  readonly matched: boolean;
  /** Evaluation duration in milliseconds */
  readonly durationMs: number;
}
