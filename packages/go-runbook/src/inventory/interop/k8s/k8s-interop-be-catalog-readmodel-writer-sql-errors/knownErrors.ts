import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopErrorLine,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';

import { CATALOG_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBCRWSE_CAT-REA-WRI-TEM-NET-ERR',
    description: 'Errore di connessione del catalog readmodel writer SQL; temporaneità da verificare',
    // Entrambi i casi sono censiti solo in Prod; il tracker comprende anche altri servizi.
    environments: ['prod'],
    regex: interopErrorLine(INTEROP_KAFKA_SIGNATURES.connectionTimeout, INTEROP_KAFKA_SIGNATURES.tlsDisconnected),
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails:
      'Timeout o socket interrotto prima della connessione TLS; controparte, durata e recupero da verificare.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBCRWSE_CAT-REA-WRI-KAF-COO-MEM-REJ',
    description: 'Il coordinator Kafka non riconosce il member del catalog readmodel writer SQL',
    environments: ['prod'],
    regex: INTEROP_KAFKA_SIGNATURES.unknownMemberRejoinWithReason,
    evidence: 'APPLICATION_LOGS',
    resolution: 'PIN-7325',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer tenta il rejoin perché il coordinator non lo riconosce; causa e recupero da verificare.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
  }),
];
