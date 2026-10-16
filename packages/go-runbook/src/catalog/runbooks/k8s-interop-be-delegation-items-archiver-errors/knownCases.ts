import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { jiraLink } from '../common/analysisLinks.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { DELEGATION_ITEMS_ARCHIVER_ALARM as alarm } from './alarmDefinition.js';

const RECOVERY =
  'Raccogliere ambiente, orari UTC, pod/log stream e log completi. Usare i CID quando presenti; altrimenti ' +
  'leggere il contesto dell’archiver per pod e intervallo, inclusi INFO e WARN. Verificare ripresa del consumer, ' +
  'avanzamento degli offset e archiviazioni attese, senza arretrato crescente o errori irrisolti. Rejoin, token ' +
  'ottenuto, sottoscrizione al topic e allarme OK non provano il recupero. Se manca carico o la ripresa non è ' +
  'verificabile mantenere aperta l’analisi; se il crash si ripete o il consumer non avanza coinvolgere il team ' +
  'di prodotto Interoperabilità. Confermare eventuali manutenzioni MSK per cluster e finestra dell’episodio: ' +
  'la classificazione storica del 06/10/2026 non si estende a nuove occorrenze. Nessun riavvio, rilancio di ' +
  'eventi o modifica di offset/configurazione durante la verifica in sola lettura.';

function archiverCase(
  id: string,
  description: string,
  priority: number,
  regex: string,
  resolution: string,
  pin7325 = false,
): KnownCase {
  return knownCase({
    id,
    description,
    priority,
    // Production cases are supported by the archiver scan, not another service in the CID tracker.
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      stepEvidenceMatches(alarm.stepIds.queryApplicationLogs, regex),
    ),
    resolution: `${resolution} ${RECOVERY}`,
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
      ['Log di contesto', '{{vars.delegationItemsArchiverContextLogCount}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: description,
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Necessario confronto con il team di prodotto'],
      ...(pin7325 ? { links: [jiraLink('PIN-7325')] } : {}),
    },
  });
}

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  archiverCase(
    'delegation-items-archiver-kafka-heartbeat-unknown-member',
    'Il coordinator Kafka non riconosce il consumer durante l’heartbeat',
    100,
    'ERROR\\s*-\\s*(?:Response Heartbeat\\(key:\\s*12, version:\\s*\\d+\\)\\s*-\\s*The coordinator is not aware of this member\\b|The coordinator is not aware of this member,\\s*re-joining the group\\b)',
    'Il coordinator non riconosce il consumer come membro del gruppo. La causa non è determinabile dalla firma: ' +
      'verificare perdita della sessione, rete e durata delle elaborazioni. In KafkaJS heartbeatInterval regola ' +
      'la cadenza dei heartbeat, mentre sessionTimeout è la scadenza di sessione; verificare i valori effettivi ' +
      'senza modificarli. PIN-7325 è un riferimento trasversale KafkaJS da verificare, non una correzione già disponibile.',
    true,
  ),
  archiverCase(
    'delegation-items-archiver-kafka-connection-refused',
    'Connessione al broker Kafka rifiutata per il delegation items archiver',
    120,
    'ERROR\\s*-\\s*Connection error:\\s*connect ECONNREFUSED\\b',
    'Identificare broker e porta dall’errore e controllare i tentativi successivi e l’eventuale crash con retry ' +
      'esauriti. ECONNREFUSED non identifica da solo la causa e non dimostra che il problema sia temporaneo.',
  ),
  archiverCase(
    'delegation-items-archiver-kafka-wrong-coordinator',
    'Il broker non è il coordinator corretto del consumer group dell’archiver',
    110,
    'ERROR\\s*-\\s*Response Heartbeat\\(key:\\s*12, version:\\s*\\d+\\)\\s*-\\s*This is not the correct coordinator for this group\\b',
    'Distinguere coordinator errato e member sconosciuto. Verificare il nuovo coordinator, il rejoin e la ' +
      'ripresa delle elaborazioni; questa firma non prova un problema di connessione TCP al broker.',
  ),
  archiverCase(
    'delegation-items-archiver-kafka-retries-exhausted',
    'Consumer del delegation items archiver in crash con retry Kafka esauriti',
    200,
    'ERROR\\s*-\\s*(?:Crash:\\s*KafkaJSNumberOfRetriesExceeded\\b|Error Consumer crashed\\b[^\\n]*KafkaJSNumberOfRetriesExceeded\\b)',
    'Leggere l’errore originale e il payload consumer.crash, inclusi groupId, retryCount, retriable e restart. ' +
      'restart=false riguarda il singolo evento: verificare anche i WARN di riavvio effettuato dall’applicazione, ' +
      'compreso Error during restart service. Non dedurre arresto definitivo né recupero automatico.',
  ),
];
