import { SELFCARE_ALARM } from './alarmDefinition.js';
import { interop, UNKNOWN_ERROR_TITLE, unknownErrorFallback } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { KNOWN_ERRORS } from './knownErrors.js';

/**
 * Builds the interop-selfcare-1.0-apigw-5xx runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.apigw.createInteropApiGwAlarmRunbook({
    alarm: SELFCARE_ALARM,
    metadata: {
      name: SELFCARE_ALARM.runbookKey,
      description:
        'Analizza gli allarmi 5xx dell’API Gateway Selfcare INTEROP, i log del backend-for-frontend e i log correlati tramite CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'api-gateway', '5xx', 'selfcare', 'backend-for-frontend'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    resolverId: 'interop-selfcare-api-gateway-context',
    queryProfile: interop.apigw.INTEROP_API_GW_5XX_SERVICE_ERRORS_PROFILE,
    knownErrors: KNOWN_ERRORS,
    fallbackAction: unknownErrorFallback(UNKNOWN_ERROR_TITLE, [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['API Gateway ID', '{{vars.interopApiGwId}}'],
      ['Errori 5xx API Gateway', '{{vars.apiGwErrorCount}}'],
      ['Log applicativi BFF', '{{vars.interopBffLogCount}}'],
      ['CID estratti', '{{vars.interopBffCidCount}}'],
      ['Log CID tracker', '{{vars.interopCidTrackerLogCount}}'],
    ]),
  });
}
