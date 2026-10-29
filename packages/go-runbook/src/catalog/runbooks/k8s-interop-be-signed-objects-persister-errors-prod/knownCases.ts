import { knownCase, type KnownCase } from '../framework.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { SIGNED_OBJECTS_PERSISTER_ALARM as ALARM } from './alarmDefinition.js';

const DETAILS = [
  ['Ambiente', '{{vars.interopEnvironment}}'],
  ['Log group', '{{vars.interopLogGroup}}'],
  ['Servizio', '{{vars.interopPodApp}}'],
  ['CID analizzati', `{{vars.${ALARM.varPrefix}CidCount}}`],
] as const;

/** Source: Confluence 2468478981 v17; release/timeout conditions do not prove recovery. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'signed-objects-signature-reference-parse-error',
    description: 'Errore di parsing del riferimento alla firma',
    priority: 100,
    condition: all(
      { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
      stepEvidenceMatches(
        ALARM.stepIds.queryApplicationLogs,
        'Error processing message: Error: Error reading signature reference with id=[\\s\\S]*?Unable to parse signature reference for id=',
      ),
    ),
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [] },
  }),
  knownCase({
    id: 'signed-objects-purpose-risk-analysis-http-500',
    description: 'HTTP 500 durante la registrazione del documento firmato di analisi del rischio',
    priority: 110,
    // A single row must identify the queue, HTTP status and operation together.
    condition: all(
      { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
      stepEvidenceMatches(
        ALARM.stepIds.queryApplicationLogs,
        'Generic error occurs processing Queue:[\\s\\S]*?interop-safe-storage-completed-tasks-prod\\. Details:[\\s\\S]*?AxiosError: Request failed with status code 500\\b[\\s\\S]*?\\baddPurposeRiskAnalysisSignedDocument\\b',
      ),
    ),
    resolution:
      'Nessuna azione da intraprendere se si presenta durante i rilasci che coinvolgono questo tipo di attività. PIN-8813.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        { url: 'https://pagopa.atlassian.net/browse/PIN-8813', name: 'PIN-8813', type: 'JIRA' },
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773409058166419',
          name: 'Thread Slack 13/03/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'signed-objects-safe-storage-file-timeout',
    description: 'Timeout nel recupero del contenuto del file da Safe Storage',
    priority: 120,
    condition: all(
      { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
      stepEvidenceMatches(
        ALARM.stepIds.queryApplicationLogs,
        'Error processing message: Error: Error getting file content on safe storage, details: AxiosError: timeout of 30000ms exceede(?:d)?\\b',
      ),
    ),
    resolution:
      'Nessuna azione da intraprendere se il timeout è momentaneo. Qualora le occorrenze fossero elevate e ravvicinate, segnalare al team prodotto.',
    details: DETAILS,
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [] },
  }),
  knownCase({
    id: 'signed-objects-agreement-signed-contract-http-409',
    description: 'HTTP 409 durante la registrazione del contratto firmato',
    priority: 130,
    condition: all(
      { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
      stepEvidenceMatches(
        ALARM.stepIds.queryApplicationLogs,
        'Generic error occurs processing Queue:[\\s\\S]*?interop-safe-storage-completed-tasks-prod\\. Details:[\\s\\S]*?AxiosError: Request failed with status code 409\\b[\\s\\S]*?\\baddAgreementSignedContract\\b',
      ),
    ),
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1791464214954779',
          name: 'Thread Slack segnalazione 08/10/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
];
