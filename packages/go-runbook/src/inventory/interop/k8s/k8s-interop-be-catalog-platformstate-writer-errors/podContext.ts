import type { interop } from '../../../../toolkits/interop/index.js';

/** Includes INFO/WARN and works without a request CID, as Kafka errors commonly do. */
export const POD_CONTEXT: interop.k8s.QueryInteropPodContextConfig = {
  id: 'query-platformstate-writer-context',
  label: 'Contesto completo del catalog platformstate writer',
  contextName: 'Platformstate writer context',
  countVar: 'platformstateWriterContextLogCount',
  completeness: 'row-limit',
  missingContextError: 'Missing resolved INTEROP writer context',
  incompleteContextError: 'Writer context reached 1000 rows; narrow the interval or pod stream',
};
