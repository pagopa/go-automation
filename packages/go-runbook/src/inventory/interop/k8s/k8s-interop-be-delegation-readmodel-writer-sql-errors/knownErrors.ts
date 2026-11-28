import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';

import { DELEGATION_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBDRWSE_DEL-REA-WRI-SQL-KAF-COO-MEM-REJ',
    description: 'Il coordinator Kafka non riconosce il consumer del delegation readmodel writer SQL',
    // La pagina censisce Prod e Att e attribuisce il log al writer SQL.
    // Il tracker comprende altri servizi: il riconoscimento usa la query applicativa filtrata sul writer.
    environments: ['prod', 'att'],
    regex: INTEROP_KAFKA_SIGNATURES.unknownMemberRejoin,
    evidence: 'APPLICATION_LOGS',
    resolution:
      'Nessuna azione se le occorrenze sono concentrate in una finestra di pochi minuti: \u00E8 una riconnessione momentanea al broker Kafka. Se persistono per ore, verificare lo stato del pod e segnalare al team di prodotto. PIN-7325',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer Kafka ha perso la sessione di gruppo e tenta di effettuare il rejoin.',
    // La tabella indica NA: non viene attribuito un downstream esterno senza evidenze.
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
  }),
];
