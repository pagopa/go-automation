/** Options of `renderErrorChainTree`. */
export interface ErrorChainTreeOptions {
  /** Longest detail line, in characters: a longer one ends with `…`. Unbounded when absent. */
  readonly maxDetailLength?: number;
}
