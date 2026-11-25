import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { NOTIFIER_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the k8s-interop-be-notifier-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: NOTIFIER_ALARM,
    metadata: {
      name: NOTIFIER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del notifier leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'notifier', 'sqs'],
    },
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
  });
}
