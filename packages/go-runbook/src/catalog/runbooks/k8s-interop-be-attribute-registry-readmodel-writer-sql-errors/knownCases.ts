import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { jiraLink } from '../common/analysisLinks.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { ATTRIBUTE_REGISTRY_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';

const NETWORK_RESOLUTION =
  'La pagina classifica gli errori come problemi temporanei di rete, ma la durata e la ripresa devono essere verificate ' +
  'e la risoluzione è NA. Raccogliere timestamp, frequenza e log del writer, identificare la controparte effettivamente ' +
  'contattata e verificare l’esito dei tentativi successivi. Usare i CID quando presenti; in loro assenza cercare per pod ' +
  'e intervallo temporale, ampliando la finestra se necessario. Se l’errore persiste o il recupero non è verificabile, ' +
  'proseguire l’analisi con il team di prodotto. Il solo timeout o errore TLS non dimostra che il problema sia transitorio ' +
  'o risolto; la pagina non specifica soglie di persistenza, criteri di chiusura o destinatario dell’escalation.';

const KAFKA_COORDINATOR_RESOLUTION =
  'Consultare PIN-7325: la descrizione contempla perdita della sessione del consumer group per problemi di rete ' +
  'o elaborazione lenta, non soltanto connessione al cluster. La descrizione e i 20 commenti consultati non citano ' +
  'l’attribute registry readmodel writer SQL: il collegamento della pagina va confermato con evidenze di questo servizio. ' +
  'Raccogliere timestamp, frequenza delle ricorrenze e log del writer e verificare la ripresa del consumer. ' +
  'Usare i CID quando disponibili; in loro assenza cercare per pod e intervallo temporale, ampliando la finestra se necessario. ' +
  'Se il fenomeno persiste o la ripresa non è verificabile, proseguire l’analisi con il team di prodotto. ' +
  'La card non documenta una correzione definitiva; il tentativo di rejoin non prova il recupero. ' +
  'Pagina e card non specificano soglie di durata e frequenza o criteri di chiusura ed escalation.';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'attribute-registry-temporary-network-errors',
    description: 'Errore di connessione del readmodel writer SQL; temporaneità da verificare',
    priority: 100,
    // Entrambi i casi sono censiti solo in Prod; il tracker comprende anche altri servizi.
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'ERROR\\s*-\\s*Connection\\s+(?:timeout\\b|error:\\s*Client network socket disconnected before secure TLS connection was established\\b)',
      ),
    ),
    resolution: NETWORK_RESOLUTION,
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Timeout o socket interrotto prima della connessione TLS; controparte, durata e recupero da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [
        'Identificare la controparte e verificare persistenza e ripresa delle connessioni con il team di prodotto',
      ],
    },
  }),
  knownCase({
    id: 'attribute-registry-kafka-coordinator-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del readmodel writer SQL',
    priority: 90,
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'The coordinator is not aware of this member,\\s*re-joining the group\\s*-\\s*The coordinator is not aware of this member\\b',
      ),
    ),
    resolution: KAFKA_COORDINATOR_RESOLUTION,
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Il consumer tenta il rejoin perché il coordinator non lo riconosce; causa e recupero da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: [
        'Confermare il collegamento a PIN-7325 e verificare la ripresa del consumer con il team di prodotto',
      ],
      links: [jiraLink('PIN-7325')],
    },
  }),
];
