import type { Runbook } from '../../../../engine/index.js';
import { interop } from '../../../../toolkits/interop/index.js';
import { AUTH_SERVER_5XX_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_ERRORS } from './knownErrors.js';
import { AnalyzeAuditFallbackStep, AUDIT_FALLBACK_PATTERN } from './AnalyzeAuditFallbackStep.js';

/**
 * Builds the interop-auth-server-apigw-5xx runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.apigw.createInteropApiGwAlarmRunbook({
    alarm,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza gli errori 5xx dell’API Gateway authorization-server INTEROP e verifica il recupero dell’audit tramite fallback S3 per CID.',
      version: '1.0.1',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'api-gateway', '5xx', 'authorization', 'auth-server'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    resolverId: 'interop-auth-server-5xx-api-gateway-context',
    queryProfile: {
      ...interop.apigw.INTEROP_API_GW_5XX_SERVICE_ERRORS_PROFILE,
      applicationLogsQueryProfileId: 'interop-k8s-auth-server-5xx',
      buildApplicationLogsQuery: (podApp) =>
        interop.apigw.buildInteropApiGwServiceErrorsQuery(podApp, [AUDIT_FALLBACK_PATTERN]),
    },
    knownErrors: KNOWN_ERRORS,
    hooks: [{ at: 'before-cid-analysis', step: new AnalyzeAuditFallbackStep() }],
    analysisDefaults: {
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2111078419/interop-auth-server-prod-apigw-5xx',
          name: 'Runbook auth-server 5xx',
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
