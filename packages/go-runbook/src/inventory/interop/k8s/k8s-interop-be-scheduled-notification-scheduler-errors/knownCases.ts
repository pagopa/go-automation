import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopErrorLine,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';
import { NOTIFICATION_SCHEDULER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'notification-scheduler-kafka-member-rejoin',
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
