import type { interop } from '../../../../toolkits/interop/index.js';

/** Include INFO and WARN for Kafka episodes that carry no request CID. */
export const POD_CONTEXT: interop.k8s.QueryInteropPodContextConfig = {
  id: 'query-delegation-items-archiver-context',
  label: 'Contesto completo del delegation items archiver',
  contextName: 'Delegation items archiver context',
  countVar: 'delegationItemsArchiverContextLogCount',
  namespaceSuffix: '',
  completeness: 'row-limit-or-unreturned-matches',
  missingContextError: 'Missing resolved INTEROP delegation items archiver context',
  incompleteContextError: 'Archiver context is incomplete; narrow the interval or pod stream',
};
