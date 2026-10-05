import { interop, type Runbook } from '../framework.js';
import { AUDIT_SIGNER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { AUDIT_SIGNER_QUERY_PROFILE } from './queryProfile.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3130917378/k8s-interop-be-audit-signer-errors';

export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    id: alarm.runbookKey,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza gli errori dell’audit signer INTEROP e raccoglie i log correlati per verificare upload e retry su Safe Storage.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'audit', 'safe-storage'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    service: { name: alarm.podApp, logGroup: alarm.logGroup, varPrefix: alarm.varPrefix },
    resolveAlarmContext: alarm.resolveContext,
    queryProfile: AUDIT_SIGNER_QUERY_PROFILE,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
