import { interopK8sKnownError, type InteropK8sKnownErrorRefs } from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';
import { SIGNED_OBJECTS_PERSISTER_ALARM as ALARM } from './alarmDefinition.js';

const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: ALARM.stepIds.queryCidTracker,
  varPrefix: ALARM.varPrefix,
};

/** Source: Confluence 2468478981 v17; release/timeout conditions do not prove recovery. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBSOPEP_SIG-OBJ-SIG-REF-PAR-ERR',
    description: 'Errore di parsing del riferimento alla firma',
    environments: ['prod'],
    regex:
      'Error processing message: Error: Error reading signature reference with id=[\\s\\S]*?Unable to parse signature reference for id=',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    finalActions: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBSOPEP_SIG-OBJ-PUR-RIS-ANA-HTT-500',
    description: 'HTTP 500 durante la registrazione del documento firmato di analisi del rischio',
    // A single row must identify the queue, HTTP status and operation together.
    environments: ['prod'],
    regex:
      'Generic error occurs processing Queue:[\\s\\S]*?interop-safe-storage-completed-tasks-prod\\. Details:[\\s\\S]*?AxiosError: Request failed with status code 500\\b[\\s\\S]*?\\baddPurposeRiskAnalysisSignedDocument\\b',
    evidence: 'APPLICATION_LOGS',
    resolution:
      'Nessuna azione da intraprendere se si presenta durante i rilasci che coinvolgono questo tipo di attività. PIN-8813.',
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
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBSOPEP_SIG-OBJ-SAF-STO-FIL-TIM',
    description: 'Timeout nel recupero del contenuto del file da Safe Storage',
    environments: ['prod'],
    regex:
      'Error processing message: Error: Error getting file content on safe storage, details: AxiosError: timeout of 30000ms exceede(?:d)?\\b',
    evidence: 'APPLICATION_LOGS',
    resolution:
      'Nessuna azione da intraprendere se il timeout è momentaneo. Qualora le occorrenze fossero elevate e ravvicinate, segnalare al team prodotto.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    finalActions: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBSOPEP_SIG-OBJ-AGR-SIG-CON-HTT-409',
    description: 'HTTP 409 durante la registrazione del contratto firmato',
    environments: ['prod'],
    regex:
      'Generic error occurs processing Queue:[\\s\\S]*?interop-safe-storage-completed-tasks-prod\\. Details:[\\s\\S]*?AxiosError: Request failed with status code 409\\b[\\s\\S]*?\\baddAgreementSignedContract\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
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
  }),
];
