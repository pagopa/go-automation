import { COMPUTE_AGREEMENTS_CONSUMER_ALARM } from './alarmDefinition.js';
import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';

const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.queryCidTracker,
  varPrefix: COMPUTE_AGREEMENTS_CONSUMER_ALARM.varPrefix,
};
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBCACE_COM-AGR-KAF-WRO-GRO-COO',
    description: 'Kafka restituisce un coordinator non corretto per il consumer group',
    regex: INTEROP_KAFKA_SIGNATURES.wrongCoordinator,
    resolution: 'PIN-7325 (Da verificare)',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer non riesce a usare il coordinator Kafka individuato per il consumer group.',
    // La colonna Downstream del documento riporta esplicitamente "NA".
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773057607941239',
        name: 'Thread Slack 09/03/2026',
        type: 'SLACK',
      },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBCACE_COM-AGR-KAF-MEM-REJ',
    description: 'Il coordinator Kafka non riconosce il member del consumer group',
    regex: INTEROP_KAFKA_SIGNATURES.unknownMemberRejoin,
    resolution:
      "Se l\u2019errore si presenta per un picco di occorrenze della durata di qualche secondo/minuto, non c'\u00E8 bisogno di fare ulteriori azioni",
    // Il matcher non dimostra da solo che il picco sia terminato: serve conferma operativa.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer deve effettuare il rejoin perché il coordinator Kafka non riconosce il member.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBCACE_COM-AGR-TLS-CON-ERR',
    description: 'Connessione interrotta prima dell’instaurazione TLS',
    regex: INTEROP_KAFKA_SIGNATURES.tlsDisconnected,
    resolution:
      "Se l\u2019errore si presenta per un picco di occorrenze della durata di qualche secondo/minuto, non c'\u00E8 bisogno di fare ulteriori azioni",
    // Il matcher non dimostra da solo che il picco sia terminato: serve conferma operativa.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il socket di rete si interrompe prima che venga stabilita la connessione TLS.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
];
