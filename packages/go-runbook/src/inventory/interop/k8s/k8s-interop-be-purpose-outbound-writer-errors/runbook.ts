import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { PURPOSE_OUTBOUND_WRITER_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { PURPOSE_OUTBOUND_WRITER_QUERY_PROFILE } from './queryProfile.js';
import { POD_CONTEXT } from './podContext.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3317530626/k8s-interop-be-purpose-outbound-writer-errors';

/**
 * Builds the k8s-interop-be-purpose-outbound-writer-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: PURPOSE_OUTBOUND_WRITER_ALARM,
    metadata: {
      name: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del purpose outbound writer leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.1.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'purpose', 'outbound-writer', 'kafka'],
    },
    queryProfile: PURPOSE_OUTBOUND_WRITER_QUERY_PROFILE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },
    podContext: {
      step: POD_CONTEXT,
      evidenceId: 'purpose-outbound-writer-context',
      evidenceLabel: 'Contesto Kafka del purpose outbound writer',
    },
    analysisDefaults: {
      runbookName: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey,
      links: [{ url: RUNBOOK_URL, name: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
