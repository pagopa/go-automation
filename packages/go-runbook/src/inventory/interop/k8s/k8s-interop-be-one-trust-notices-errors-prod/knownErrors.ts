import {
  INTEROP_DOWNSTREAMS,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';
import { ONE_TRUST_NOTICES_ALARM as ALARM } from './alarmDefinition.js';

const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: ALARM.stepIds.queryCidTracker,
  varPrefix: ALARM.varPrefix,
};
const DETAILS = [
  ['Ambiente', '{{vars.interopEnvironment}}'],
  ['Log group', '{{vars.interopLogGroup}}'],
  ['Servizio', '{{vars.interopPodApp}}'],
  ['Log applicativi', `{{vars.${ALARM.varPrefix}LogCount}}`],
] as const;

// Sources: Confluence 2389835914 v2 (500/503), v3 (SSL), v4 (502).
// The historical analysis status does not establish recovery for a new occurrence.
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBOTNEP_ONE-TRU-HTT-503',
    description: 'OneTrust: risposta HTTP 503',
    regex: 'AxiosError: Request failed with status code 503\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'PIN-7321',
    details: DETAILS,
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.ONE_TRUST],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7321', name: 'PIN-7321', type: 'JIRA' }],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBOTNEP_ONE-TRU-HTT-502',
    description: 'OneTrust: risposta HTTP 502',
    regex: 'AxiosError: Request failed with status code 502\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Da segnalare solo se le occorrenze diventano numerose (vedi thread Slack).',
    details: DETAILS,
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.ONE_TRUST],
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1793097705299659',
        name: 'Thread Slack 27/10/2026',
        type: 'SLACK',
      },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBOTNEP_ONE-TRU-HTT-500',
    description: 'OneTrust: risposta HTTP 500',
    regex: 'AxiosError: Request failed with status code 500\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'PIN-8724. Il problema verrà gestito tramite la politica di retry implementata nel task PIN-7321.',
    details: DETAILS,
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.ONE_TRUST],
    finalActions: [],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-8724', name: 'PIN-8724', type: 'JIRA' },
      { url: 'https://pagopa.atlassian.net/browse/PIN-7321', name: 'PIN-7321', type: 'JIRA' },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBOTNEP_ONE-TRU-SSL-CON',
    description: 'Errore di connessione SSL nei log di interop-be-one-trust-notices',
    regex: 'Error: There was an error establishing an SSL connection\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    extraDetails: [['Nota', 'Errore osservato su stderr; il collegamento con l’allarme resta da approfondire.']],
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.ONE_TRUST],
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1791281845977249',
        name: 'Thread Slack 06/10/2026',
        type: 'SLACK',
      },
    ],
  }),
];
