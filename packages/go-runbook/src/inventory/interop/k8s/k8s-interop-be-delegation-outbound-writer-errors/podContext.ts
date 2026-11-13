import type { interop } from '../../../../toolkits/interop/index.js';

/** Include INFO and WARN for Kafka episodes that carry no request CID. */
export const POD_CONTEXT: interop.k8s.QueryInteropPodContextConfig = {
  id: 'query-delegation-outbound-writer-context',
  label: 'Contesto completo del delegation outbound writer',
  contextName: 'Delegation items writer context',
  countVar: 'delegationOutboundWriterContextLogCount',
  namespaceSuffix: '',
  completeness: 'row-limit-or-unreturned-matches',
  missingContextError: 'Missing resolved INTEROP delegation outbound writer context',
  incompleteContextError: 'Writer context is incomplete; narrow the interval or pod stream',
};
