import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopErrorLine,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';

import { NOTIFIER_SEEDER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
const OFFSET_COMMIT_WRONG_COORDINATOR = `Response OffsetCommit\\(key:\\s*8,\\s*version:\\s*\\d+\\)\\s*-\\s*${INTEROP_KAFKA_SIGNATURES.wrongCoordinator}`;
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNSE_NOT-SEE-KAF-COO-MEM-REJ',
    description: 'Rejoin del consumer Kafka per momentanea mancata connessione al broker',
    regex: interopErrorLine(INTEROP_KAFKA_SIGNATURES.unknownMemberRejoin),
    evidence: 'APPLICATION_LOGS',
    resolution: 'Non sono necessarie azioni di risoluzione se i log sono concentrati in un intervallo temporale breve.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il coordinator Kafka non riconosce il consumer del notifier seeder, che rientra nel consumer group.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBNSE_NOT-SEE-OFF-COM-WRO-COO',
    description: 'Commit dell’offset verso un broker che non è più il coordinator del gruppo',
    regex: interopErrorLine(OFFSET_COMMIT_WRONG_COORDINATOR),
    evidence: 'APPLICATION_LOGS',
    resolution: 'Nessuna azione da intraprendere.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer client comunica con un broker che non è più il coordinator del gruppo.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
];
