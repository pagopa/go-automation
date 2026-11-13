import type { interop } from '../../../../toolkits/interop/index.js';

/** Includes INFO/WARN and works without a request CID, as Kafka errors commonly do. */
export const POD_CONTEXT: interop.k8s.QueryInteropPodContextConfig = {
  id: 'query-purpose-outbound-writer-context',
  label: 'Contesto completo del purpose outbound writer',
  contextName: 'Purpose outbound writer context',
  countVar: 'purposeOutboundWriterContextLogCount',
  completeness: 'row-limit',
  missingContextError: 'Missing resolved INTEROP writer context',
  incompleteContextError: 'Writer context reached 1000 rows; narrow the interval or pod stream',
};
