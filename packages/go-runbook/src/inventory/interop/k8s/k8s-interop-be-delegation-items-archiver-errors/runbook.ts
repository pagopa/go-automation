import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { DELEGATION_ITEMS_ARCHIVER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_ERRORS } from './knownErrors.js';
import { ARCHIVER_QUERY_PROFILE } from './queryProfile.js';
import { POD_CONTEXT } from './podContext.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3344762934/k8s-interop-be-delegation-items-archiver-errors';

/**
 * Builds the k8s-interop-be-delegation-items-archiver-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm,
    metadata: {
      name: alarm.runbookKey,
      description: 'Analizza gli errori Kafka del delegation items archiver e raccoglie il contesto anche senza CID.',
      version: '1.1.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'delegation', 'archiver', 'kafka'],
    },
    knownErrors: KNOWN_ERRORS,
    queryProfile: ARCHIVER_QUERY_PROFILE,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },

    podContext: {
      step: POD_CONTEXT,
      evidenceId: 'delegation-items-archiver-context',
      evidenceLabel: 'Contesto di riavvio e recupero archiviazione',
    },
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
    // Replace the builder's pod-name resource with the actual census entry.
    primaryResource: { name: alarm.runbookKey, type: 'Service' },
  });
}
