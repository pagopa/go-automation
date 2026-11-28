import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';

import { ESERVICE_TEMPLATE_INSTANCES_UPDATER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBETIUE_ESE-TEM-INS-UPD-KAF-COO-UNK-MEM',
    description: 'Il coordinator Kafka non riconosce il consumer dell’updater delle istanze di template',
    // La pagina censisce l’heartbeat in Prod; il commento 354627 di PIN-7325 contiene anche il rejoin.
    // Entrambi i messaggi devono provenire dalla query applicativa filtrata sull’updater, non dal tracker.
    environments: ['prod'],
    regex: `(?:${INTEROP_KAFKA_SIGNATURES.unknownMemberHeartbeat}|${INTEROP_KAFKA_SIGNATURES.unknownMemberRejoin})`,
    evidence: 'APPLICATION_LOGS',
    resolution:
      'PIN-7325 Nessuna azione se le occorrenze sono concentrate in una finestra di pochi minuti: \u00E8 una riconnessione momentanea al broker Kafka. Se persistono per ore, verificare lo stato del pod e segnalare al team di prodotto.',
    extraDetails: [
      ['Evidenza documentale', 'PIN-7325, commento 354627: Prod, 30/09/2026, CID assente'],
      ['Causa e recupero', 'Da verificare per l’occorrenza in analisi'],
    ],
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails:
      'Il coordinator Kafka non riconosce il consumer dell’updater; causa e ripresa dell’elaborazione da verificare.',
    // Downstream NA nella pagina: nessuna attribuzione a servizi esterni senza evidenze.
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
  }),
];
