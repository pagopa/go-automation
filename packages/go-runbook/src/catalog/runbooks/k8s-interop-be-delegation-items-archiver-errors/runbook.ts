import { interop, type Runbook } from '../framework.js';
import { DELEGATION_ITEMS_ARCHIVER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { ARCHIVER_QUERY_PROFILE } from './queryProfile.js';
import { QueryDelegationItemsArchiverContextStep } from './QueryDelegationItemsArchiverContextStep.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3344762934/k8s-interop-be-delegation-items-archiver-errors';

export function buildRunbook(): Runbook {
  const runbook = interop.k8s.createInteropK8sAlarmRunbook({
    id: alarm.runbookKey,
    metadata: {
      name: alarm.runbookKey,
      description: 'Analizza gli errori Kafka del delegation items archiver e raccoglie il contesto anche senza CID.',
      version: '1.1.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'delegation', 'archiver', 'kafka'],
    },
    service: { name: alarm.podApp, logGroup: alarm.logGroup, varPrefix: alarm.varPrefix },
    resolveAlarmContext: alarm.resolveContext,
    knownCases: KNOWN_CASES,
    queryProfile: ARCHIVER_QUERY_PROFILE,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },

    hooks: [
      {
        at: 'before-cid-analysis',
        step: new QueryDelegationItemsArchiverContextStep(),
        evidence: [
          {
            id: 'delegation-items-archiver-context',
            label: 'Contesto di riavvio e recupero archiviazione',
            type: 'log-sample',
            messageFields: ['log', '@message'],
            // The query rejects capped results: keep the whole episode, including its start.
            retention: { mode: 'all' },
          },
        ],
      },
    ],
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
  return {
    ...runbook,
    analysisDefaults: {
      ...runbook.analysisDefaults,
      // Replace the builder's pod-name resource with the actual census entry.
      resources: [{ name: alarm.runbookKey, type: 'Service', role: 'PRIMARY' }],
    },
  };
}
