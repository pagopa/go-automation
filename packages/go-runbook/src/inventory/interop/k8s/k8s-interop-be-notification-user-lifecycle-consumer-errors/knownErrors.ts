import { NOTIFICATION_USER_LIFECYCLE_ALARM as ALARM } from './alarmDefinition.js';
import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import { type KnownError, stepEvidenceMatches } from '../../../../engine/index.js';

const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: ALARM.stepIds.queryCidTracker,
  varPrefix: ALARM.varPrefix,
};

/** Sources: Confluence 2659549286 v1/v12/v16-v18 and production logs of 2026-10-22/23. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNULCE_NOT-KAF-NO-BRO',
    description: 'Nessun broker Kafka disponibile',
    environments: ['prod'],
    regex: 'Crash: KafkaJSNoBrokerAvailableError: No broker available\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNULCE_NOT-KAF-MET-TIM',
    description: 'Timeout della richiesta Metadata al cluster Kafka',
    environments: ['prod', 'att'],
    regex: 'Crash: KafkaJSNumberOfRetriesExceeded: Request Metadata\\(key: \\d+, version: \\d+\\) timed out\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNULCE_NOT-KAF-REP-RET-EXH',
    description: 'Retry Kafka esauriti per replica non disponibile',
    environments: ['prod', 'test'],
    regex: 'Crash: KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'PIN-7325',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNULCE_NOT-KAF-BRO-COM-ERR',
    description: 'Errore di connessione verso Kafka',
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'and',
          conditions: [
            { type: 'contains', ref: 'vars.interopEnvironment', value: ['prod', 'test', 'att'] },
            stepEvidenceMatches(ALARM.stepIds.queryApplicationLogs, 'Connection error: read ECONNRESET\\b'),
          ],
        },
        {
          type: 'and',
          conditions: [
            { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
            stepEvidenceMatches(ALARM.stepIds.queryApplicationLogs, INTEROP_KAFKA_SIGNATURES.tlsDisconnected),
          ],
        },
        {
          type: 'and',
          conditions: [
            { type: 'contains', ref: 'vars.interopEnvironment', value: ['prod', 'att', 'test'] },
            stepEvidenceMatches(ALARM.stepIds.queryApplicationLogs, 'The group coordinator is not available'),
          ],
        },
      ],
    },
    // The source asks whether PIN-7325 applies to connection errors; it does not resolve that question.
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNULCE_NOT-KAF-REA-TIM',
    description: 'Timeout di lettura nella connessione Kafka',
    environments: ['prod'],
    regex: 'Connection error: read ETIMEDOUT\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNULCE_NOT-DUP-EVE-STR-VER',
    description: 'Evento duplicato su events_stream_id_version_key',
    regex:
      'Error creating event: error: duplicate key value violates unique constraint[^\\n]*events_stream_id_version_key',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Nessuna azione necessaria.',
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
    finalActions: [],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-6474', name: 'PIN-6474', type: 'JIRA' },
      { url: 'https://pagopa.atlassian.net/browse/PIN-7796', name: 'PIN-7796', type: 'JIRA' },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNULCE_NOT-CER-TEN-IST-NOT-FOU',
    description: 'Tenant ISTAT del certificatore non trovato',
    regex: 'Message: Certifier tenant ISTAT not found\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Nessuna azione necessaria',
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
    finalActions: [],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-10543', name: 'PIN-10543', type: 'JIRA' },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1783335064037389',
        name: 'Thread Slack 06/07/2026',
        type: 'SLACK',
      },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNULCE_NOT-REM-API-ROL-CON',
    description: 'HTTP 409 durante la rimozione del ruolo api dalla configurazione delle notifiche',
    environments: ['prod', 'att'],
    regex:
      'Error removing role api from notification config for user[^\\r\\n]*in tenant[^\\r\\n]*AxiosError: Request failed with status code 409\\b',
    evidence: 'APPLICATION_LOGS',
    resolution:
      'Risoluzione non documentata. Nei log circostanti è possibile verificare il conflitto (risorsa già eliminata) cercando la DELETE di internal/userNotificationConfigs con ruolo API conclusa con 204:No Content.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1791191514995439',
        name: 'Thread Slack 05/10/2026',
        type: 'SLACK',
      },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNULCE_NOT-SEL-TEN-NOT-FOU',
    description: 'Tenant assente nel read model per il selfcareId',
    environments: ['prod', 'test', 'att'],
    regex: 'Error handling Kafka message\\. Topic: sc-users\\.[^\\r\\n]*Tenant not found for selfcareId:',
    evidence: 'APPLICATION_LOGS',
    resolution:
      "È possibile verificare l’assenza del tenant tramite la query:\nselect * from <env>_tenant.tenant where selfcare_id = '<uuid>';",
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1795696658251719',
        name: 'Thread Slack 26/11/2026',
        type: 'SLACK',
      },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1791284530634809',
        name: 'Thread Slack 06/10/2026',
        type: 'SLACK',
      },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNULCE_NOT-ENS-CON-CON-409',
    description: 'HTTP 409 nella verifica dell’esistenza della configurazione delle notifiche',
    environments: ['prod', 'att', 'test'],
    regex:
      'Error in request to ensure a notification config exists for user \\S+ in tenant \\S+ with role \\S+\\. Reason: AxiosError: Request failed with status code 409\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    finalActions: [],
    links: [],
  }),
];
