import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';
import { NOTIFICATION_SCHEDULER_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { NOTIFICATION_SCHEDULER_QUERY_PROFILE } from './queryProfile.js';
import { QueryNotificationSchedulerContextStep } from './QueryNotificationSchedulerContextStep.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3363635346/k8s-interop-be-scheduled-notification-scheduler-errors';

export function buildRunbook(): Runbook {
  const runbook = interop.k8s.createInteropK8sAlarmRunbook({
    id: NOTIFICATION_SCHEDULER_ALARM.runbookKey,
    metadata: {
      name: NOTIFICATION_SCHEDULER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del scheduled notification scheduler leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'notification', 'scheduler', 'kafka'],
    },
    service: {
      name: NOTIFICATION_SCHEDULER_ALARM.podApp,
      logGroup: NOTIFICATION_SCHEDULER_ALARM.logGroup,
      varPrefix: NOTIFICATION_SCHEDULER_ALARM.varPrefix,
    },
    resolveAlarmContext: NOTIFICATION_SCHEDULER_ALARM.resolveContext,
    queryProfile: NOTIFICATION_SCHEDULER_QUERY_PROFILE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },
    analysisDefaults: {
      runbookName: NOTIFICATION_SCHEDULER_ALARM.runbookKey,
      links: [{ url: RUNBOOK_URL, name: NOTIFICATION_SCHEDULER_ALARM.runbookKey, type: 'CONFLUENCE' }],
    },
  });
  const contextStep = { step: new QueryNotificationSchedulerContextStep() };
  // Collect context before AnalyzeCidTracker can resolve a known case early.
  return {
    ...runbook,
    steps: runbook.steps.flatMap((descriptor) =>
      descriptor.step.id === NOTIFICATION_SCHEDULER_ALARM.stepIds.analyzeCidTracker
        ? [contextStep, descriptor]
        : [descriptor],
    ),
  };
}
