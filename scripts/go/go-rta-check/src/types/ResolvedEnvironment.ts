/**
 * Resolved environment filter.
 *
 * `environmentIds` is the filter applied to the occurrences: omitted means no
 * filter (every environment of the product), one id means a single environment,
 * several ids mean the environments allowed by the configured scope.
 */
export interface ResolvedEnvironment {
  readonly environmentIds?: ReadonlyArray<string>;
  /** Display label: the environment name, or "tutti gli ambienti". */
  readonly environmentName: string;
}
