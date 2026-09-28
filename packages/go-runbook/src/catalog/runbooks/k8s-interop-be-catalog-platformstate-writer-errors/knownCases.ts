import { CATALOG_PLATFORMSTATE_WRITER_ALARM } from './alarmDefinition.js';
import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';

import { jiraLink } from '../common/analysisLinks.js';
import { interopKnownCase, type InteropKnownCaseRefs } from '../interop/interopKnownCases.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: CATALOG_PLATFORMSTATE_WRITER_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: CATALOG_PLATFORMSTATE_WRITER_ALARM.stepIds.queryCidTracker,
  varPrefix: CATALOG_PLATFORMSTATE_WRITER_ALARM.varPrefix,
};

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'catalog-platformstate-writer-temporary-network-errors',
    description: 'Problema temporaneo di rete del catalog platformstate writer',
    priority: 100,
    regex:
      'ERROR\\s*-\\s*Connection\\s+(?:timeout|error:\\s*Client network socket disconnected before secure TLS connection was established)',
    resolution:
      'Il documento classifica il caso come problema temporaneo di rete ma non indica una risoluzione operativa. ' +
      'Verificare se l’errore persiste e, in tal caso, proseguire l’analisi sui CID disponibili.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Timeout o interruzione del socket di rete prima dell’instaurazione della connessione TLS.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare la persistenza dell’errore e approfondire i CID disponibili'],
  }),
  interopKnownCase(REFS, {
    id: 'catalog-platformstate-writer-kafka-coordinator-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del catalog platformstate writer',
    priority: 90,
    regex:
      '(?:Response Heartbeat\\(key:\\s*12, version:\\s*3\\)|The coordinator is not aware of this member, re-joining the group)\\s*-\\s*The coordinator is not aware of this member',
    resolution:
      'Problema noto di connessione al cluster Kafka. Consultare PIN-7325 per lo stato e le indicazioni operative ' +
      'aggiornate; se l’errore persiste, proseguire l’analisi sui CID disponibili.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il coordinator Kafka non riconosce il member durante l’heartbeat o il rejoin del consumer group.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare PIN-7325 e la persistenza degli errori di connessione a Kafka'],
    links: [jiraLink('PIN-7325')],
  }),
];
