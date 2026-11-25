import type { interop } from '../../../../toolkits/interop/index.js';

/** Includes INFO/WARN and works without a request CID, as Kafka errors commonly do. */
export const POD_CONTEXT: interop.k8s.QueryInteropPodContextConfig = {
  id: 'query-notification-scheduler-context',
  label: 'Contesto completo del scheduled notification scheduler',
  contextName: 'Notification scheduler context',
  countVar: 'notificationSchedulerContextLogCount',
  completeness: 'row-limit',
  missingContextError: 'Missing resolved INTEROP notification scheduler context',
  incompleteContextError: 'Scheduler context reached 1000 rows; narrow the interval or pod stream',
};
