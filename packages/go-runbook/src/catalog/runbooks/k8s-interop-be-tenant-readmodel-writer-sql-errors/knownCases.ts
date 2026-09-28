import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { jiraLink } from '../common/analysisLinks.js';
import { interopKnownCase, type InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { TENANT_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'tenant-readmodel-writer-sql-kafka-tls-connection-error',
    description: 'Connessione TLS verso il cluster Kafka interrotta',
    priority: 100,
    regex:
      'ERROR\\s*-\\s*Connection error: Client network socket disconnected before secure TLS connection was established',
    resolution:
      'Il documento non indica una risoluzione. Correlare gli eventuali CID, verificare se l’errore persiste ' +
      'e consultare PIN-7325 per lo stato dell’hotfix.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Errore di rete o connessione verso il cluster Kafka prima dell’instaurazione TLS.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare la persistenza dell’errore e lo stato di PIN-7325'],
    links: [jiraLink('PIN-7325')],
  }),
];
