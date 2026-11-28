import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { AUDIT_SIGNER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_ERRORS } from './knownErrors.js';
import { AUDIT_SIGNER_QUERY_PROFILE } from './queryProfile.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3130917378/k8s-interop-be-audit-signer-errors';

/**
 * Builds the k8s-interop-be-audit-signer-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm,
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
    queryProfile: AUDIT_SIGNER_QUERY_PROFILE,
    knownErrors: KNOWN_ERRORS,
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
