import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase, type Condition } from '../framework.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { PURPOSE_OUTBOUND_WRITER_ALARM as alarm } from './alarmDefinition.js';

const RECOVERY =
  'Raccogliere ambiente, orari UTC, pod/log stream e log completi. Usare i CID quando presenti; ' +
  'in loro assenza analizzare il contesto del writer per pod e intervallo temporale, includendo INFO e WARN. ' +
  'Verificare ripresa del consumer, avanzamento degli eventi e aggiornamenti attesi nella destinazione, ' +
  'senza arretrato in crescita o errori irrisolti. Rejoin, token ottenuto, sottoscrizione al topic e allarme OK ' +
  'non provano da soli il recupero. La durata di circa un minuto è un’indicazione storica, non una soglia di chiusura. ' +
  'Se manca carico o la ripresa non è verificabile, mantenere l’analisi aperta. Se il consumer non avanza, ' +
  'il crash si ripete o l’arretrato cresce, coinvolgere il team di prodotto Interoperabilità senza attendere ore o giorni. ' +
  'Verificare eventuale manutenzione MSK nella stessa finestra e registrarne il riferimento; ' +
  'l’evento del 6 ottobre 2026 non giustifica automaticamente nuove occorrenze. ' +
  'La verifica è in sola lettura: eventuali riavvii o modifiche richiedono una valutazione separata.';

function evidence(regex: string): Condition {
  // The documented cases are Prod-only. Errors of other services in CID tracking
  // provide context but cannot classify this writer's failure.
  return all(varEquals('interopEnvironment', 'prod'), stepEvidenceMatches(alarm.stepIds.queryApplicationLogs, regex));
}

function writerCase(id: string, description: string, priority: number, regex: string, resolution: string): KnownCase {
  return knownCase({
    id,
    description,
    priority,
    condition: evidence(regex),
    resolution: `${resolution} ${RECOVERY}`,
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: description,
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Necessario confronto con il team di prodotto'],
    },
  });
}

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  writerCase(
    'purpose-outbound-writer-kafka-member-rejoin',
    'Il coordinator Kafka non riconosce il member del consumer group',
    100,
    'ERROR\\s*-\\s*The coordinator is not aware of this member,\\s*re-joining the group\\b',
    'Il consumer tenta di rientrare nel gruppo perché il coordinator non riconosce il member; ' +
      'il messaggio non dimostra una mancata connessione al broker né identifica da solo la causa. ' +
      'Verificare perdita della sessione, rete e durata delle elaborazioni, distinguendo tentativo di rejoin e ripresa effettiva.',
  ),
  writerCase(
    'purpose-outbound-writer-kafka-connection-refused',
    'Connessione al broker rifiutata durante l’esecuzione del purpose outbound writer',
    120,
    'ERROR\\s*-\\s*Connection error:\\s*connect ECONNREFUSED\\b',
    'Identificare il broker e la porta nei log, controllare i tentativi successivi e l’eventuale crash con retry esauriti. ' +
      'ECONNREFUSED non prova da solo la causa né la temporaneità del problema.',
  ),
  writerCase(
    'purpose-outbound-writer-kafka-wrong-coordinator',
    'Il broker contattato non è il coordinator corretto del consumer group',
    110,
    'Response Heartbeat\\(key:\\s*12, version:\\s*\\d+\\)\\s*-\\s*This is not the correct coordinator for this group\\b',
    'Distinguere coordinator non corretto e member sconosciuto. Verificare aggiornamento del coordinator, ' +
      'tentativo di rejoin e ripresa delle elaborazioni. Il messaggio non dimostra un problema di connessione TCP.',
  ),
  writerCase(
    'purpose-outbound-writer-kafka-retries-exhausted',
    'Consumer del purpose outbound writer in crash con retry Kafka esauriti',
    200,
    '(?:Crash:\\s*KafkaJSNumberOfRetriesExceeded\\b|Error Consumer crashed\\b[^\\n]*KafkaJSNumberOfRetriesExceeded\\b)',
    'Leggere errore originale e payload consumer.crash, inclusi groupId, retryCount, retriable e restart. ' +
      'restart=false riguarda il singolo evento: verificare anche il riavvio effettuato dall’applicazione e i relativi WARN; ' +
      'non assumere né arresto definitivo né recupero automatico.',
  ),
];
