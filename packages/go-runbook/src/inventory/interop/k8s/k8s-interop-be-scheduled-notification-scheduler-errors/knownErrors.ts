import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopErrorLine,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';
import { NOTIFICATION_SCHEDULER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBSNSE_NOT-SCH-KAF-MEM-REJ',
    description: 'Il coordinator Kafka non riconosce il consumer dello scheduled notification scheduler',
    environments: ['prod'],
    // Only the scheduler error scan is evidence; the CID tracker spans other services.
    regex: interopErrorLine(
      INTEROP_KAFKA_SIGNATURES.unknownMemberHeartbeat,
      INTEROP_KAFKA_SIGNATURES.unknownMemberRejoin,
    ),
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
    ],
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails:
      'Kafka segnala member sconosciuto durante heartbeat o rejoin; causa e ripresa delle schedulazioni da verificare.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
];
