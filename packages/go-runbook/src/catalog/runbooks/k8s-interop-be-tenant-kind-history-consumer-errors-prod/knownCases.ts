import { knownCase, type KnownCase } from '../framework.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { TENANT_KIND_HISTORY_ALARM as ALARM } from './alarmDefinition.js';

const DETAILS = [
  ['Ambiente', '{{vars.interopEnvironment}}'],
  ['Log group', '{{vars.interopLogGroup}}'],
  ['Servizio', '{{vars.interopPodApp}}'],
  ['CID analizzati', `{{vars.${ALARM.varPrefix}CidCount}}`],
] as const;

/** Confluence 3418358502 v1: notification depends on persistence, which the signature alone cannot establish. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'tenant-kind-history-kafka-coordinator-errors',
    description: 'Errori di comunicazione con il broker Kafka del tenant kind history consumer',
    priority: 100,
    condition: all(
      { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
      stepEvidenceMatches(
        ALARM.stepIds.queryApplicationLogs,
        'Response Heartbeat\\(key: 12, version: 3\\) - The coordinator is not aware of this member\\b|Connection error: connect ECONNREFUSED The coordinator is not aware of this member, re-joining the group\\b',
      ),
    ),
    resolution:
      'Se le occorrenze sono singole o circoscritte a qualche minuto, non è necessario segnalarle al team di prodotto; se la situazione perdura nel tempo, aprire un thread per la segnalazione.',
    details: DETAILS,
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [] },
  }),
  knownCase({
    id: 'tenant-kind-history-kafka-incorrect-coordinator',
    description: 'Coordinatore Kafka non corretto per il gruppo',
    priority: 110,
    condition: all(
      { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
      stepEvidenceMatches(
        ALARM.stepIds.queryApplicationLogs,
        '(?:Response (?:Heartbeat\\(key: 12, version: 3\\)|JoinGroup\\(key: 11, version: 5\\)|LeaveGroup\\(key: 13, version: 3\\)) - |Crash: KafkaJSNonRetriableError: )This is not the correct coordinator for this group\\b',
      ),
    ),
    // Real AWS logs on 2026-10-06, query 4743b740-908b-46f4-b726-a4309220ab66.
    // The historical maintenance classification does not supply a recovery procedure.
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE', finalActions: [] },
  }),
];
