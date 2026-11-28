import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';
import { ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_ERRORS } from './knownErrors.js';
import { ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_QUERY_PROFILE } from './queryProfile.js';
const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3206578389/k8s-interop-be-async-token-generation-readmodel-checker-errors';
/**
 * Builds the k8s-interop-be-async-token-generation-readmodel-checker-errors runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza gli errori del checker asincrono del read model di token generation in attestazione, raccoglie i CID e verifica i disallineamenti dei platform state del catalogo.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'async-token-generation', 'readmodel', 'checker', 'platform-states'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    queryProfile: ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_QUERY_PROFILE,
    knownErrors: KNOWN_ERRORS,
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      finalActions: [],
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
}
