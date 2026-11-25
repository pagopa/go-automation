export interface PredicateEvaluation {
  readonly matched: boolean;
  /** Trace payload; absent when the caller only asked for a boolean. */
  readonly detail?: unknown;
  /** Indices of every array element that satisfies the predicate, in detailed mode. */
  readonly indices?: ReadonlyArray<number>;
}
