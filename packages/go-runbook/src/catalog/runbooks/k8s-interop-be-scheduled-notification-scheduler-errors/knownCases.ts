import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { NOTIFICATION_SCHEDULER_ALARM as alarm } from './alarmDefinition.js';
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'notification-scheduler-kafka-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il consumer dello scheduled notification scheduler',
    priority: 100,
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      // Only the scheduler error scan is evidence; the CID tracker spans other services.
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'ERROR\\s*-\\s*(?:Response Heartbeat\\(key:\\s*12, version:\\s*\\d+\\)\\s*-\\s*The coordinator is not aware of this member\\b|The coordinator is not aware of this member,\\s*re-joining the group\\b)',
      ),
    ),
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Kafka segnala member sconosciuto durante heartbeat o rejoin; causa e ripresa delle schedulazioni da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [],
      links: [],
    },
  }),
];
