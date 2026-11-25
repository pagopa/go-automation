import {
  INTEROP_KAFKA_SIGNATURES,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';
import { TENANT_KIND_HISTORY_ALARM as ALARM } from './alarmDefinition.js';

const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: ALARM.stepIds.queryCidTracker,
  varPrefix: ALARM.varPrefix,
};

/** Confluence 3418358502 v1: notification depends on persistence, which the signature alone cannot establish. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'tenant-kind-history-kafka-coordinator-errors',
    description: 'Errori di comunicazione con il broker Kafka del tenant kind history consumer',
    environments: ['prod'],
    regex: `(?:${INTEROP_KAFKA_SIGNATURES.unknownMemberHeartbeat}|${INTEROP_KAFKA_SIGNATURES.connectionRefused} ${INTEROP_KAFKA_SIGNATURES.unknownMemberRejoin})`,
    evidence: 'APPLICATION_LOGS',
    resolution:
      'Se le occorrenze sono singole o circoscritte a qualche minuto, non è necessario segnalarle al team di prodotto; se la situazione perdura nel tempo, aprire un thread per la segnalazione.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    finalActions: [],
  }),
  interopK8sKnownCase(REFS, {
    id: 'tenant-kind-history-kafka-incorrect-coordinator',
    description: 'Coordinatore Kafka non corretto per il gruppo',
    environments: ['prod'],
    regex: `(?:${INTEROP_KAFKA_SIGNATURES.wrongCoordinatorResponse}|Crash: KafkaJSNonRetriableError: ${INTEROP_KAFKA_SIGNATURES.wrongCoordinator})`,
    evidence: 'APPLICATION_LOGS',
    // Real AWS logs on 2026-10-06, query 4743b740-908b-46f4-b726-a4309220ab66.
    // The historical maintenance classification does not supply a recovery procedure.
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    finalActions: [],
  }),
];
