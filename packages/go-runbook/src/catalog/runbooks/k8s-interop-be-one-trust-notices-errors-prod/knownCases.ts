import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { ONE_TRUST_NOTICES_ALARM as ALARM } from './alarmDefinition.js';

const DETAILS = [
  ['Ambiente', '{{vars.interopEnvironment}}'],
  ['Log group', '{{vars.interopLogGroup}}'],
  ['Servizio', '{{vars.interopPodApp}}'],
  ['Log applicativi', `{{vars.${ALARM.varPrefix}LogCount}}`],
] as const;

// Sources: Confluence 2389835914 v2 (500/503), v3 (SSL), v4 (502).
// The historical analysis status does not establish recovery for a new occurrence.
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'one-trust-http-503',
    description: 'OneTrust: risposta HTTP 503',
    priority: 120,
    condition: stepEvidenceMatches(
      ALARM.stepIds.queryApplicationLogs,
      'AxiosError: Request failed with status code 503\\b',
    ),
    resolution: 'PIN-7321',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.ONE_TRUST],
      finalActions: [],
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7321', name: 'PIN-7321', type: 'JIRA' }],
    },
  }),
  knownCase({
    id: 'one-trust-http-502',
    description: 'OneTrust: risposta HTTP 502',
    priority: 110,
    condition: stepEvidenceMatches(
      ALARM.stepIds.queryApplicationLogs,
      'AxiosError: Request failed with status code 502\\b',
    ),
    resolution: 'Da segnalare solo se le occorrenze diventano numerose (vedi thread Slack).',
    details: DETAILS,
    analysis: {
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
    },
  }),
  knownCase({
    id: 'one-trust-http-500',
    description: 'OneTrust: risposta HTTP 500',
    priority: 100,
    condition: stepEvidenceMatches(
      ALARM.stepIds.queryApplicationLogs,
      'AxiosError: Request failed with status code 500\\b',
    ),
    resolution: 'PIN-8724. Il problema verrà gestito tramite la politica di retry implementata nel task PIN-7321.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.ONE_TRUST],
      finalActions: [],
      links: [
        { url: 'https://pagopa.atlassian.net/browse/PIN-8724', name: 'PIN-8724', type: 'JIRA' },
        { url: 'https://pagopa.atlassian.net/browse/PIN-7321', name: 'PIN-7321', type: 'JIRA' },
      ],
    },
  }),
  knownCase({
    id: 'one-trust-ssl-connection',
    description: 'Errore di connessione SSL nei log di interop-be-one-trust-notices',
    priority: 90,
    condition: stepEvidenceMatches(
      ALARM.stepIds.queryApplicationLogs,
      'Error: There was an error establishing an SSL connection\\b',
    ),
    resolution: 'Risoluzione non documentata.',
    details: [...DETAILS, ['Nota', 'Errore osservato su stderr; il collegamento con l’allarme resta da approfondire.']],
    analysis: {
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
    },
  }),
];
