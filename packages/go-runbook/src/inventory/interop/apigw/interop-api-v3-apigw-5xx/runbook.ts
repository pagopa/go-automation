import type { Runbook } from '../../../../engine/index.js';
import { interop } from '../../../../toolkits/interop/index.js';
import { INTEROP_API_V3_5XX_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';

const RUNBOOK_URL = 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3418358470/interop-api-v3-prod-apigw-5xx';

/**
 * Builds the interop-api-v3-apigw-5xx runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.apigw.createInteropApiGwAlarmRunbook({
    alarm,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza gli allarmi 5xx API Gateway M2M v3 INTEROP, i log del gateway applicativo e i CID correlati.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'api-gateway', '5xx', 'm2m', 'api-v3'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    resolverId: 'interop-api-v3-api-gateway-context',
    queryProfile: {
      ...interop.apigw.INTEROP_API_GW_5XX_SERVICE_ERRORS_PROFILE,
      applicationLogsQueryProfileId: 'interop-k8s-m2m-v3-5xx',
    },
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      links: [{ url: RUNBOOK_URL, name: 'Runbook API v3 5xx', type: 'CONFLUENCE' }],
    },
  });
}
