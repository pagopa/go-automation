import { CATALOG_READMODEL_WRITER_SQL_ALARM } from './alarmDefinition.js';
import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';

import { jiraLink } from '../common/analysisLinks.js';
import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { interopKnownCase } from '../interop/interopKnownCases.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: CATALOG_READMODEL_WRITER_SQL_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: CATALOG_READMODEL_WRITER_SQL_ALARM.stepIds.queryCidTracker,
  varPrefix: CATALOG_READMODEL_WRITER_SQL_ALARM.varPrefix,
};

const TEMPORARY_NETWORK_RESOLUTION =
  'Il documento classifica il caso come problema temporaneo di rete ma non indica una risoluzione operativa. ' +
  'Verificare se l’errore persiste e, in tal caso, proseguire l’analisi sui CID disponibili.';

const KAFKA_COORDINATOR_RESOLUTION =
  'Problema noto di connessione al cluster Kafka. Consultare PIN-7325 per lo stato e le indicazioni operative ' +
  'aggiornate; se l’errore persiste, proseguire l’analisi.';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'catalog-readmodel-writer-temporary-network-errors',
    description: 'Problema temporaneo di rete del catalog readmodel writer SQL',
    priority: 100,
    // La pagina Confluence contiene sia uno sia due spazi attorno al separatore.
    regex:
      'ERROR\\s*-\\s*Connection\\s+(?:timeout|error:\\s*Client network socket disconnected before secure TLS connection was established)',
    resolution: TEMPORARY_NETWORK_RESOLUTION,
    // La risoluzione documentale è "NA": non proponiamo una chiusura automatica.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Timeout o interruzione del socket di rete prima dell’instaurazione della connessione TLS.',
    // "NA" nella colonna Downstream corrisponde al valore censito "Nessuno".
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare la persistenza dell’errore e approfondire i CID disponibili'],
  }),
  interopKnownCase(REFS, {
    id: 'catalog-readmodel-writer-kafka-coordinator-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del catalog readmodel writer SQL',
    priority: 90,
    regex:
      'The coordinator is not aware of this member, re-joining the group\\s*-\\s*The coordinator is not aware of this member',
    resolution: KAFKA_COORDINATOR_RESOLUTION,
    // PIN-7325 è presentata come hotfix: serve conferma umana prima della chiusura.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer deve effettuare il rejoin perché il coordinator Kafka non riconosce il member.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare PIN-7325 e la persistenza degli errori di connessione a Kafka'],
    links: [jiraLink('PIN-7325')],
  }),
];
