import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';
import { PURPOSE_OUTBOUND_WRITER_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { PURPOSE_OUTBOUND_WRITER_QUERY_PROFILE } from './queryProfile.js';
import { QueryPurposeOutboundContextStep } from './QueryPurposeOutboundContextStep.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3317530626/k8s-interop-be-purpose-outbound-writer-errors';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey,
    metadata: {
      name: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del purpose outbound writer leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.1.0',
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
    queryProfile: PURPOSE_OUTBOUND_WRITER_QUERY_PROFILE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },
    hooks: [
      {
        at: 'before-cid-analysis',
        step: new QueryPurposeOutboundContextStep(),
        evidence: [
          {
            id: 'purpose-outbound-writer-context',
            label: 'Contesto Kafka del purpose outbound writer',
            type: 'log-sample',
            messageFields: ['log', '@message'],
            // The query rejects capped results: keep the whole episode, including its start.
            retention: { mode: 'all' },
          },
        ],
      },
    ],
    analysisDefaults: {
      runbookName: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey,
      links: [{ url: RUNBOOK_URL, name: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
