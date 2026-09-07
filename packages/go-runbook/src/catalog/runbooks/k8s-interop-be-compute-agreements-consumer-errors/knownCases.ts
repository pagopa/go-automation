import { COMPUTE_AGREEMENTS_CONSUMER_ALARM } from './alarmDefinition.js';
import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';

import { jiraLink, slackLink } from '../common/analysisLinks.js';
import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { interopKnownCase } from '../interop/interopKnownCases.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.queryCidTracker,
  varPrefix: COMPUTE_AGREEMENTS_CONSUMER_ALARM.varPrefix,
};

const KAFKA_COORDINATOR_SLACK_THREAD = 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773057607941239';

const TRANSIENT_KAFKA_RESOLUTION =
  'Nessuna azione necessaria se l’errore è un picco circoscritto a pochi secondi o minuti. ' +
  'Se persiste, verificare lo stato del pod e notificare il team prodotto.';

const TRANSIENT_TLS_RESOLUTION =
  'Nessuna azione necessaria se l’errore è un picco circoscritto a pochi secondi o minuti. ' +
  'Se persiste, notificare il team prodotto.';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'compute-agreements-kafka-wrong-group-coordinator',
    description: 'Kafka restituisce un coordinator non corretto per il consumer group',
    priority: 100,
    regex: 'This is not the correct coordinator for this group',
    resolution:
      'Consultare PIN-7325 e proseguire l’analisi manuale: la procedura risolutiva è ancora indicata ' +
      'come “Da verificare” nel documento.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer non riesce a usare il coordinator Kafka individuato per il consumer group.',
    // La colonna Downstream del documento riporta esplicitamente "NA".
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare PIN-7325 e completare l’analisi operativa del caso'],
    links: [jiraLink('PIN-7325'), slackLink(KAFKA_COORDINATOR_SLACK_THREAD, 'Thread Slack 09/03/2026')],
  }),
  interopKnownCase(REFS, {
    id: 'compute-agreements-kafka-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del consumer group',
    priority: 90,
    regex: 'The coordinator is not aware of this member, re-joining the group',
    resolution: TRANSIENT_KAFKA_RESOLUTION,
    // Il matcher non dimostra da solo che il picco sia terminato: serve conferma operativa.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer deve effettuare il rejoin perché il coordinator Kafka non riconosce il member.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Se l’errore persiste, verificare il pod e notificare il team prodotto'],
  }),
  interopKnownCase(REFS, {
    id: 'compute-agreements-tls-connection-error',
    description: 'Connessione interrotta prima dell’instaurazione TLS',
    priority: 80,
    regex: 'Connection error: Client network socket disconnected before secure TLS connection was established',
    resolution: TRANSIENT_TLS_RESOLUTION,
    // Il matcher non dimostra da solo che il picco sia terminato: serve conferma operativa.
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il socket di rete si interrompe prima che venga stabilita la connessione TLS.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Se l’errore persiste, notificare il team prodotto'],
  }),
];
