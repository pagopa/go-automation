import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { M2M_TOKEN_DETAILS_PERSISTER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3392307262/k8s-interop-be-m2m-token-details-persister-errors';

/**
 * Builds the k8s-interop-be-m2m-token-details-persister-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm,
    metadata: {
      name: alarm.runbookKey,
      description: 'Analizza l’allarme k8s del m2m token details persister, estrae i CID e consulta i log correlati.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'm2m', 'token', 'kafka'],
    },
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
