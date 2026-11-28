import { escapeLogsInsightsString } from '@pagopa/go-aws/cloudwatch-logs/insights';
/**
 * Runbook: k8s-interop-be-one-trust-notices-errors-prod
 */

import { interop } from '../../../../toolkits/interop/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { ONE_TRUST_NOTICES_ALARM as ALARM } from './alarmDefinition.js';
import { KNOWN_ERRORS } from './knownErrors.js';

/**
 * Builds the k8s-interop-be-one-trust-notices-errors-prod runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return interop.k8s.createInteropK8sAlarmRunbook({
    alarm: ALARM,
    metadata: {
      name: ALARM.runbookKey,
      description: 'Diagnosi degli errori OneTrust del servizio interop-be-one-trust-notices in produzione',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'onetrust'],
    },
    queryProfile: {
      ...interop.k8s.INTEROP_K8S_QUERY_PROFILE,
      id: 'interop-one-trust-notices-prod',
      applicationLogsQueryProfileId: 'interop-one-trust-notices-prod-errors',
      buildApplicationLogsQuery: (
        podApp,
      ) => `filter pod_namespace = "prod" and pod_app = "${escapeLogsInsightsString(podApp)}"
| filter (@message like /ERROR/ or stream = "stderr")
| filter @logStream not like /adot-collector/
| parse @message "[CID=*]" as cid
| display @timestamp, pod_app, cid, @message
| sort @timestamp asc`,
    },
    knownErrors: KNOWN_ERRORS,
    analysisDefaults: {
      runbookName: ALARM.runbookKey,
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2389835914/k8s-interop-be-one-trust-notices-errors-prod',
          name: ALARM.runbookKey,
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
