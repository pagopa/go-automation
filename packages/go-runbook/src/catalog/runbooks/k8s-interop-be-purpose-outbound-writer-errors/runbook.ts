import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';
import { PURPOSE_OUTBOUND_WRITER_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey,
    metadata: {
      name: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del purpose outbound writer leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'purpose', 'outbound-writer', 'kafka'],
    },
    service: {
      name: PURPOSE_OUTBOUND_WRITER_ALARM.podApp,
      logGroup: PURPOSE_OUTBOUND_WRITER_ALARM.logGroup,
      varPrefix: PURPOSE_OUTBOUND_WRITER_ALARM.varPrefix,
    },
    resolveAlarmContext: PURPOSE_OUTBOUND_WRITER_ALARM.resolveContext,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
  });
}
