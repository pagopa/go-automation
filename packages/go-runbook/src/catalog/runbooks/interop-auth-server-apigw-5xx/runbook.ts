import type { Runbook } from '../framework.js';
import { interop } from '../framework.js';
import { AUTH_SERVER_5XX_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { AnalyzeAuditFallbackStep } from './AnalyzeAuditFallbackStep.js';

export function buildRunbook(): Runbook {
  const runbook = interop.apigw.createInteropApiGwAlarmRunbook({
    id: alarm.runbookKey,
    metadata: {
      name: alarm.runbookKey,
      description:
        'Analizza gli errori 5xx dell’API Gateway authorization-server INTEROP e verifica il recupero dell’audit tramite fallback S3 per CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'api-gateway', '5xx', 'authorization', 'auth-server'],
    },
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 1 },
    resolverId: 'interop-auth-server-5xx-api-gateway-context',
    resolveAlarmContext: alarm.resolveContext,
    queryProfile: {
      ...interop.apigw.INTEROP_API_GW_5XX_SERVICE_ERRORS_PROFILE,
      applicationLogsQueryProfileId: 'interop-k8s-auth-server-5xx',
    },
    apiGw: { logGroupTemplate: alarm.apiGwLogGroupTemplate, profileId: alarm.apiGwProfileId },
    application: {
      serviceName: alarm.serviceName,
      logGroupTemplate: alarm.applicationLogGroupTemplate,
      varPrefix: alarm.varPrefix,
      podAppFilter: 'interop-be-authorization-server',
    },
    knownCases: KNOWN_CASES,
  });
  return {
    ...runbook,
    // The final CID analyzer resolves the runbook: insert verification before it.
    steps: runbook.steps.flatMap((descriptor) =>
      descriptor.step.id === alarm.stepIds.analyzeCidTracker
        ? [{ step: new AnalyzeAuditFallbackStep() }, descriptor]
        : [descriptor],
    ),
    analysisDefaults: {
      ...runbook.analysisDefaults,
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2111078419/interop-auth-server-prod-apigw-5xx',
          name: 'Runbook auth-server 5xx',
          type: 'CONFLUENCE',
        },
      ],
    },
  };
}
