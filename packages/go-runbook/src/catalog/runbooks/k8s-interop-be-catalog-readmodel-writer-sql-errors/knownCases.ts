import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { jiraLink } from '../common/analysisLinks.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { CATALOG_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';

const NETWORK_RESOLUTION =
  'Raccogliere timestamp, frequenza e log completi del writer, identificare la controparte effettivamente contattata ' +
  'e verificare l’esito dei tentativi successivi. Usare i CID quando presenti; in loro assenza cercare per pod ' +
  'e intervallo temporale con Application-Logs-Context, ampliando la finestra se necessario. ' +
  'Il solo timeout o errore TLS non dimostra che il problema sia transitorio o risolto. ' +
  'I criteri operativi della pagina richiedono almeno cinque periodi da 60 secondi senza nuove ricorrenze ERROR/stderr, ' +
  'prove di elaborazione effettiva e propagazione attesa nel readmodel SQL, senza arretrato in aumento. ' +
  'Estendere l’osservazione con il team di prodotto per fenomeni intermittenti; in assenza di carico o prova di ripresa ' +
  'mantenere l’analisi aperta. Se l’errore persiste o ricompare, il consumer non avanza, compaiono crash con retry esauriti ' +
  'o il recupero non è verificabile, proseguire l’analisi coinvolgendo il team di prodotto Interoperabilità e allegando ' +
  'ambiente, intervallo UTC, log completi e CID disponibili. Il referente nominativo e l’eventuale SLA restano da confermare; ' +
  'non è documentata una correzione definitiva per questa casistica.';

const KAFKA_COORDINATOR_RESOLUTION =
  'Consultare PIN-7325: la descrizione contempla perdita della sessione del consumer group per problemi di rete ' +
  'o elaborazione lenta, non soltanto connessione al cluster. La descrizione e i 20 commenti consultati non citano ' +
  'il catalog readmodel writer SQL: il collegamento della pagina va confermato con evidenze di questo servizio. ' +
  'Raccogliere timestamp, frequenza delle ricorrenze e log del writer e verificare la ripresa del consumer. ' +
  'Usare i CID quando disponibili; in loro assenza cercare per pod e intervallo temporale, ampliando la finestra se necessario. ' +
  'La card non documenta una correzione definitiva; il tentativo di rejoin non prova il recupero. ' +
  'Usare Application-Logs-Context per controllare tutti i livelli del writer. I criteri operativi della pagina richiedono ' +
  'almeno cinque periodi da 60 secondi senza nuove ricorrenze ERROR/stderr, prove di elaborazione effettiva e propagazione ' +
  'attesa nel readmodel SQL, senza arretrato in aumento. Estendere l’osservazione con il team di prodotto per fenomeni ' +
  'intermittenti; in assenza di carico o prova di ripresa mantenere l’analisi aperta. Se il fenomeno persiste o ricompare, ' +
  'il consumer non avanza, compaiono crash con retry esauriti o la ripresa non è verificabile, proseguire l’analisi ' +
  'coinvolgendo il team di prodotto Interoperabilità e allegando ambiente, intervallo UTC, log completi e CID disponibili. ' +
  'Il referente nominativo e l’eventuale SLA restano da confermare: questi criteri operativi non sono una correzione di PIN-7325.';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'catalog-readmodel-writer-temporary-network-errors',
    description: 'Errore di connessione del catalog readmodel writer SQL; temporaneità da verificare',
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
    id: 'catalog-readmodel-writer-kafka-coordinator-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il member del catalog readmodel writer SQL',
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
