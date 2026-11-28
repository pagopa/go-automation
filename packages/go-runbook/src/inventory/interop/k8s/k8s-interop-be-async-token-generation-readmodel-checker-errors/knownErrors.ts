import {
  INTEROP_DOWNSTREAMS,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';

import { ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
const UUID_PATTERN = '[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}';
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBATGRCE_ASY-TOK-GEN-CAT-PLA-STA-DIF',
    description: 'Disallineamento dei platform state di una voce del catalogo ESERVICEDESCRIPTOR',
    // The tracker includes other microservices; only the checker's own errors identify this case.
    environments: ['att'],
    regex:
      'Differences in platform-states when checking catalog entry ESERVICEDESCRIPTOR#' +
      `${UUID_PATTERN}#${UUID_PATTERN}(?=$|[\\s:;"\\\\])`,
    evidence: 'APPLICATION_LOGS',
    level: 'warn',
    resolution: 'PIN-10541',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['Errore', `{{vars.${alarm.varPrefix}ErrorMsg}}`],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
    ],
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails:
      'Differenze nei platform state di una voce ESERVICEDESCRIPTOR; causa, collegamento a PIN-10541 e recupero da verificare.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-10541', name: 'PIN-10541', type: 'JIRA' },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784019090399849',
        name: 'Thread Slack del caso noto',
        type: 'SLACK',
      },
    ],
  }),
];
