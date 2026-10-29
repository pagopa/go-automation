import { NOTIFICATION_USER_LIFECYCLE_ALARM as ALARM } from './alarmDefinition.js';
import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';

const DETAILS = [
  ['Ambiente', '{{vars.interopEnvironment}}'],
  ['Log group', '{{vars.interopLogGroup}}'],
  ['Servizio', '{{vars.interopPodApp}}'],
  ['CID analizzati', `{{vars.${ALARM.varPrefix}CidCount}}`],
] as const;

/** Sources: Confluence 2659549286 v1/v12/v16-v18 and production logs of 2026-10-22/23. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'notification-kafka-no-broker',
    description: 'Nessun broker Kafka disponibile',
    priority: 130,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
        stepEvidenceMatches(
          ALARM.stepIds.queryApplicationLogs,
          'Crash: KafkaJSNoBrokerAvailableError: No broker available\\b',
        ),
      ],
    },
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'notification-kafka-metadata-timeout',
    description: 'Timeout della richiesta Metadata al cluster Kafka',
    priority: 120,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
        stepEvidenceMatches(
          ALARM.stepIds.queryApplicationLogs,
          'Crash: KafkaJSNumberOfRetriesExceeded: Request Metadata\\(key: \\d+, version: \\d+\\) timed out\\b',
        ),
      ],
    },
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'notification-kafka-replica-retries-exhausted',
    description: 'Retry Kafka esauriti per replica non disponibile',
    priority: 110,
    condition: {
      type: 'and',
      conditions: [
        { type: 'contains', ref: 'vars.interopEnvironment', value: ['prod', 'test'] },
        stepEvidenceMatches(
          ALARM.stepIds.queryApplicationLogs,
          'Crash: KafkaJSNumberOfRetriesExceeded: The replica is not available for the requested topic-partition\\b',
        ),
      ],
    },
    resolution: 'PIN-7325',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
    },
  }),
  knownCase({
    id: 'notification-kafka-broker-communication-errors',
    description: 'Errore di connessione verso Kafka',
    priority: 100,
    condition: {
      type: 'or',
      conditions: [
        {
          type: 'and',
          conditions: [
            { type: 'contains', ref: 'vars.interopEnvironment', value: ['prod', 'test'] },
            stepEvidenceMatches(ALARM.stepIds.queryApplicationLogs, 'Connection error: read ECONNRESET\\b'),
          ],
        },
        {
          type: 'and',
          conditions: [
            { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
            stepEvidenceMatches(
              ALARM.stepIds.queryApplicationLogs,
              'Connection error: Client network socket disconnected before secure TLS connection was established|The group coordinator is not available',
            ),
          ],
        },
      ],
    },
    // The source asks whether PIN-7325 applies to connection errors; it does not resolve that question.
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'notification-kafka-read-timeout',
    description: 'Timeout di lettura nella connessione Kafka',
    priority: 95,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
        stepEvidenceMatches(ALARM.stepIds.queryApplicationLogs, 'Connection error: read ETIMEDOUT\\b'),
      ],
    },
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'notification-duplicate-event-stream-version',
    description: 'Evento duplicato su events_stream_id_version_key',
    priority: 90,
    condition: stepEvidenceMatches(
      ALARM.stepIds.queryApplicationLogs,
      'Error creating event: error: duplicate key value violates unique constraint[^\\n]*events_stream_id_version_key',
    ),
    resolution: 'Nessuna azione necessaria.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        { url: 'https://pagopa.atlassian.net/browse/PIN-6474', name: 'PIN-6474', type: 'JIRA' },
        { url: 'https://pagopa.atlassian.net/browse/PIN-7796', name: 'PIN-7796', type: 'JIRA' },
      ],
    },
  }),
  knownCase({
    id: 'notification-certifier-tenant-istat-not-found',
    description: 'Tenant ISTAT del certificatore non trovato',
    priority: 80,
    condition: stepEvidenceMatches(ALARM.stepIds.queryApplicationLogs, 'Message: Certifier tenant ISTAT not found\\b'),
    resolution: 'Nessuna azione necessaria',
    details: DETAILS,
    analysis: {
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
    },
  }),
  knownCase({
    id: 'notification-remove-api-role-conflict',
    description: 'HTTP 409 durante la rimozione del ruolo api dalla configurazione delle notifiche',
    priority: 145,
    condition: {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
        stepEvidenceMatches(
          ALARM.stepIds.queryApplicationLogs,
          'Error removing role api from notification config for user[^\\r\\n]*in tenant[^\\r\\n]*AxiosError: Request failed with status code 409\\b',
        ),
      ],
    },
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
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
    },
  }),
  knownCase({
    id: 'notification-selfcare-tenant-not-found',
    description: 'Tenant assente nel read model per il selfcareId',
    priority: 135,
    condition: {
      type: 'and',
      conditions: [
        { type: 'contains', ref: 'vars.interopEnvironment', value: ['prod', 'test', 'att'] },
        stepEvidenceMatches(
          ALARM.stepIds.queryApplicationLogs,
          'Error handling Kafka message\\. Topic: sc-users\\.[^\\r\\n]*Tenant not found for selfcareId:',
        ),
      ],
    },
    resolution:
      "È possibile verificare l’assenza del tenant tramite la query:\nselect * from <env>_tenant.tenant where selfcare_id = '<uuid>';",
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1791284530634809',
          name: 'Thread Slack 06/10/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
];
