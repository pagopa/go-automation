import type { KnownCase } from '../framework.js';

import { jiraLink } from '../common/analysisLinks.js';
import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { interopKnownCase } from '../interop/interopKnownCases.js';
import { INTEROP_NOTIFICATION_USER_LIFECYCLE_VAR_PREFIX } from './resolveInteropAlarmContext.js';
import { QUERY_INTEROP_APPLICATION_LOGS_STEP_ID, QUERY_INTEROP_CID_TRACKER_STEP_ID } from './runbookSteps.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: QUERY_INTEROP_APPLICATION_LOGS_STEP_ID,
  cidTrackerStepId: QUERY_INTEROP_CID_TRACKER_STEP_ID,
  varPrefix: INTEROP_NOTIFICATION_USER_LIFECYCLE_VAR_PREFIX,
};

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'notification-kafka-broker-communication-errors',
    description: 'Errore di connessione verso Kafka',
    priority: 100,
    regex:
      'Connection error: read ECONNRESET|' +
      'KafkaJS\\s*NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
    resolution: 'Verificare PIN-7325 e la disponibilita dei broker Kafka; raccogliere i CID se il problema persiste.',
    // Chiede di verificare i broker e raccogliere i CID: l'analisi resta aperta.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    links: [jiraLink('PIN-7325')],
  }),
  interopKnownCase(REFS, {
    id: 'notification-duplicate-event-stream-version',
    description: 'Evento duplicato su events_stream_id_version_key',
    priority: 90,
    regex:
      'Error creating event: error: duplicate key value violates unique constraint ' +
      '\\\\?"events_stream_id_version_key\\\\?"',
    resolution: 'Nessuna azione necessaria: richiesta duplicata gia censita. Vedere PIN-6474 e PIN-7796.',
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
    links: [jiraLink('PIN-6474'), jiraLink('PIN-7796')],
  }),
  interopKnownCase(REFS, {
    id: 'notification-certifier-tenant-istat-not-found',
    description: 'Tenant ISTAT del certificatore non trovato',
    priority: 80,
    regex: 'Message: Certifier tenant ISTAT not found',
    resolution: 'Nessuna azione necessaria. Caso censito in PIN-10543.',
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
    links: [jiraLink('PIN-10543')],
  }),
];
