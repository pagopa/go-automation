import { COMPUTE_AGREEMENTS_CONSUMER_ALARM } from './alarmDefinition.js';
import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';

import type { InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { interopKnownCase } from '../interop/interopKnownCases.js';
const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: COMPUTE_AGREEMENTS_CONSUMER_ALARM.stepIds.queryCidTracker,
  varPrefix: COMPUTE_AGREEMENTS_CONSUMER_ALARM.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'compute-agreements-kafka-wrong-group-coordinator',
    description: 'Kafka restituisce un coordinator non corretto per il consumer group',
    priority: 100,
    regex: 'This is not the correct coordinator for this group',
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
  interopKnownCase(REFS, {
    id: 'compute-agreements-kafka-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del consumer group',
    priority: 90,
    regex: 'The coordinator is not aware of this member, re-joining the group',
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
  interopKnownCase(REFS, {
    id: 'compute-agreements-tls-connection-error',
    description: 'Connessione interrotta prima dell’instaurazione TLS',
    priority: 80,
    regex: 'Connection error: Client network socket disconnected before secure TLS connection was established',
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
