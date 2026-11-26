export interface ConditionEvaluationDetails {
  readonly matched: boolean;
  readonly resolvedValues: Readonly<Record<string, unknown>>;
  /**
   * Evidence of the match: for each array ref, the indices of the elements that satisfied a predicate in a
   * logically satisfied branch. An `or` contributes only its matching branches, a `not` nothing. Empty when the
   * condition did not match or read only scalars.
   */
  readonly evidence: ReadonlyMap<string, ReadonlySet<number>>;
}
