import {
  INTEROP_DOWNSTREAMS,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';

import { TENANT_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'tenant-readmodel-writer-sql-kafka-tls-connection-error',
    description: 'Connessione TLS verso il cluster Kafka interrotta',
    priority: 100,
    regex:
      'ERROR\\s*-\\s*Connection error: Client network socket disconnected before secure TLS connection was established',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Errore di rete o connessione verso il cluster Kafka prima dell’instaurazione TLS.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
];
