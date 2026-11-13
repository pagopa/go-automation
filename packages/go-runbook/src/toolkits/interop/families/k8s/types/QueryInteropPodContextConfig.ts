import type { InteropPodContextCompleteness } from './InteropPodContextCompleteness.js';

/**
 * Configuration of {@link QueryInteropPodContextStep}: the full log context of
 * the alarmed pod, at every level (EVO-RBREORG-OPUS-01 P30).
 */
export interface QueryInteropPodContextConfig {
  /** Step id. */
  readonly id: string;
  /** Step label. */
  readonly label: string;
  /** Name of the context in the execution narrative and in `<name> failed: …` errors. */
  readonly contextName: string;
  /** Variable that receives the number of rows. */
  readonly countVar: string;
  /**
   * Filter on `pod_namespace`: absent, no filter; otherwise the resolved INTEROP
   * environment followed by this suffix (`''` for the environment itself).
   */
  readonly namespaceSuffix?: string;
  /**
   * When the context counts as incomplete: at the row limit, or also when
   * CloudWatch matched more records than it returned.
   */
  readonly completeness: InteropPodContextCompleteness;
  /** Error when the resolved log group, pod app (or environment, with a namespace filter) is missing. */
  readonly missingContextError: string;
  /** Error when the context is incomplete. */
  readonly incompleteContextError: string;
}
