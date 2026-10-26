import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';

import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { M2M_EVENT_DISPATCHER_ALARM } from './alarmDefinition.js';
const DETAILS = [
  ['Ambiente', '{{vars.interopEnvironment}}'],
  ['Log group', '{{vars.interopLogGroup}}'],
  ['Servizio', '{{vars.interopPodApp}}'],
  ['CID analizzati', `{{vars.${M2M_EVENT_DISPATCHER_ALARM.varPrefix}CidCount}}`],
] as const;

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'm2m-consumer-crash',
    description: 'Crash del consumer Kafka dopo esaurimento dei tentativi',
    priority: 120,
    condition: stepEvidenceMatches(
      M2M_EVENT_DISPATCHER_ALARM.stepIds.queryApplicationLogs,
      'Crash: KafkaJSNumberOfRetriesExceeded|Error Consumer crashed',
    ),
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
    id: 'm2m-connection-refused',
    description: 'Connessione al broker Kafka rifiutata',
    priority: 110,
    condition: stepEvidenceMatches(
      M2M_EVENT_DISPATCHER_ALARM.stepIds.queryApplicationLogs,
      'Connection error: connect ECONNREFUSED',
    ),
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
    id: 'm2m-wrong-coordinator',
    description: 'Coordinator Kafka non corretto per il consumer group',
    priority: 100,
    condition: stepEvidenceMatches(
      M2M_EVENT_DISPATCHER_ALARM.stepIds.queryApplicationLogs,
      'This is not the correct coordinator for this group',
    ),
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
    id: 'm2m-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del consumer group',
    priority: 90,
    condition: stepEvidenceMatches(
      M2M_EVENT_DISPATCHER_ALARM.stepIds.queryApplicationLogs,
      'The coordinator is not aware of this member',
    ),
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
    id: 'm2m-connection-timeout-tls',
    description: 'Timeout di connessione o interruzione prima della negoziazione TLS',
    priority: 80,
    condition: stepEvidenceMatches(
      M2M_EVENT_DISPATCHER_ALARM.stepIds.queryApplicationLogs,
      'Connection timeout|Connection error: Client network socket disconnected before secure TLS connection was established',
    ),
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
];
