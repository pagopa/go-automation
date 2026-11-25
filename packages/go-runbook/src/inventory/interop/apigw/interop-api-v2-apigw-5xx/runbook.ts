import type { Runbook } from '../../../../engine/index.js';
import { interop } from '../../../../toolkits/interop/index.js';
import { INTEROP_API_V2_5XX_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';

const RUNBOOK_URL = 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2585526322/interop-api-v2-prod-apigw-5xx';

/**
 * Builds the interop-api-v2-apigw-5xx runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.apigw.createInteropApiGwAlarmRunbook({
    alarm,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza gli allarmi 5xx API Gateway M2M v2 INTEROP, i log del gateway applicativo e i CID correlati.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'api-gateway', '5xx', 'm2m', 'api-v2'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    resolverId: 'interop-api-v2-api-gateway-context',
    queryProfile: {
      ...interop.apigw.INTEROP_API_GW_5XX_SERVICE_ERRORS_PROFILE,
      applicationLogsQueryProfileId: 'interop-k8s-m2m-v2-5xx',
      // The documented 012-0021 case is logged as WARN despite returning HTTP 500.
      buildApplicationLogsQuery: (podApp) =>
        interop.apigw.buildInteropApiGwServiceErrorsQuery(podApp, ['Unexpected client kind']),
    },
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      links: [{ url: RUNBOOK_URL, name: 'Runbook API v2 5xx', type: 'CONFLUENCE' }],
    },
  });
}
