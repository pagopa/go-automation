import type { QueryInteropPodContextConfig } from './QueryInteropPodContextConfig.js';

/**
 * The full log context of the alarmed pod, read before the CID analysis: the read and the `log-sample` evidence that
 * keeps the whole episode.
 */
export interface InteropK8sPodContext {
  readonly step: QueryInteropPodContextConfig;
  readonly evidenceId: string;
  readonly evidenceLabel: string;
}
