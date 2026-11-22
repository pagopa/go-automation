import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { DELEGATION_OUTBOUND_WRITER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { DELEGATION_OUTBOUND_WRITER_QUERY_PROFILE } from './queryProfile.js';
import { POD_CONTEXT } from './podContext.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3375694080/k8s-interop-be-delegation-outbound-writer-errors';

/**
 * Builds the k8s-interop-be-delegation-outbound-writer-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm,
    metadata: {
      name: alarm.runbookKey,
      description: 'Analizza gli errori Kafka del delegation outbound writer e raccoglie il contesto anche senza CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'delegation', 'writer', 'kafka'],
    },
    knownCases: KNOWN_CASES,
    queryProfile: DELEGATION_OUTBOUND_WRITER_QUERY_PROFILE,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },

    podContext: {
      step: POD_CONTEXT,
      evidenceId: 'delegation-outbound-writer-context',
      evidenceLabel: 'Contesto di riavvio e rejoin del delegation outbound writer',
    },
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
    // Use the Service verified in the production Watchtower census.
    primaryResource: { name: alarm.podApp, type: 'Service' },
  });
}
