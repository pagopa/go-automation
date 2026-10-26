import { NOTIFICATION_USER_LIFECYCLE_ALARM } from './alarmDefinition.js';
import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';

import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { interopKnownCase } from '../interop/interopKnownCases.js';
import { SELFCARE_KAFKA_BROKER_COMMUNICATION_PATTERN } from '../interop/selfcareKafkaKnownCase.js';
const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: NOTIFICATION_USER_LIFECYCLE_ALARM.stepIds.queryCidTracker,
  varPrefix: NOTIFICATION_USER_LIFECYCLE_ALARM.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'notification-kafka-broker-communication-errors',
    description: 'Errore di connessione verso Kafka',
    priority: 100,
    regex: SELFCARE_KAFKA_BROKER_COMMUNICATION_PATTERN,
    resolution:
      'La pagina riporta NA per gli errori di connessione e PIN-7325 per il crash Kafka con retry esauriti. Non \u00E8 documentata una procedura risolutiva.',
    // Chiede di verificare i broker e raccogliere i CID: l'analisi resta aperta.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
    links: [],
    finalActions: [],
  }),
  interopKnownCase(REFS, {
    id: 'notification-duplicate-event-stream-version',
    description: 'Evento duplicato su events_stream_id_version_key',
    priority: 90,
    regex:
      'Error creating event: error: duplicate key value violates unique constraint[^\\n]*events_stream_id_version_key',
    resolution: 'Nessuna azione necessaria.',
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-6474', name: 'PIN-6474', type: 'JIRA' },
      { url: 'https://pagopa.atlassian.net/browse/PIN-7796', name: 'PIN-7796', type: 'JIRA' },
    ],
    finalActions: [],
  }),
  interopKnownCase(REFS, {
    id: 'notification-certifier-tenant-istat-not-found',
    description: 'Tenant ISTAT del certificatore non trovato',
    priority: 80,
    regex: 'Message: Certifier tenant ISTAT not found',
    resolution: 'Nessuna azione necessaria',
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-10543', name: 'PIN-10543', type: 'JIRA' }],
    finalActions: [],
  }),
];
