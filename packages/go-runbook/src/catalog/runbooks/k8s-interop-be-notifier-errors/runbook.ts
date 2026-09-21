import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';
import { NOTIFIER_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: NOTIFIER_ALARM.runbookKey,
    metadata: {
      name: NOTIFIER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del notifier leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'notifier', 'sqs'],
    },
    service: {
      name: NOTIFIER_ALARM.podApp,
      logGroup: NOTIFIER_ALARM.logGroup,
      varPrefix: NOTIFIER_ALARM.varPrefix,
    },
    resolveAlarmContext: NOTIFIER_ALARM.resolveContext,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
  });
}
