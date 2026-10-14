import { CATALOG_PLATFORMSTATE_WRITER_ALARM as alarm } from './alarmDefinition.js';
import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase, type Condition } from '../framework.js';
import { jiraLink } from '../common/analysisLinks.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';

const RECOVERY_CHECKS =
  'Raccogliere timestamp, pod/log stream e log completi. Usare i CID se presenti; in loro assenza analizzare ' +
  'il contesto del writer per pod e intervallo temporale, ampliando la finestra ai tentativi successivi. ' +
  'Verificare ripresa del consumer, avanzamento dell’elaborazione degli eventi e aggiornamenti attesi dello stato, ' +
  'senza arretrato in crescita o altri errori irrisolti. Rejoin, token ottenuto, sottoscrizione al topic e allarme OK ' +
  'non provano da soli il recupero. Mantenere l’analisi aperta se la ripresa non è verificabile, manca carico ' +
  'o gli errori persistono; confrontarsi con il team di prodotto Interoperabilità. ' +
  'Controllare l’eventuale manutenzione MSK nella stessa finestra: quella del 6 ottobre 2026 è confermata ' +
  'nella cronologia AWS, ma non giustifica automaticamente nuove occorrenze né prova il recupero. ' +
  'Non modificare configurazioni o riavviare consumer durante la verifica in sola lettura.';

const DETAILS = [
  ['Ambiente', '{{vars.interopEnvironment}}'],
  ['Log group', '{{vars.interopLogGroup}}'],
  ['Servizio', '{{vars.interopPodApp}}'],
  ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
] as const;

function writerEvidence(regex: string): Condition {
  // The CID tracker spans other applications: their signatures are context,
  // not proof that this writer generated the failure. Cases are documented in Prod.
  return all(varEquals('interopEnvironment', 'prod'), stepEvidenceMatches(alarm.stepIds.queryApplicationLogs, regex));
}

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'catalog-platformstate-writer-kafka-retries-exhausted',
    description: 'Consumer Kafka del catalog platformstate writer in crash con retry esauriti',
    priority: 200,
    condition: writerEvidence(
      '(?:Crash:\\s*KafkaJSNumberOfRetriesExceeded\\b|Error Consumer crashed\\b[^\\n]*KafkaJSNumberOfRetriesExceeded\\b)',
    ),
    resolution:
      `Verificare l’errore originale e il payload consumer.crash, inclusi groupId, retriable, retryCount e restart. ` +
      `restart=false nel singolo evento non dimostra un arresto definitivo del processo: verificare anche ` +
      `il riavvio effettuato dall’applicazione e i relativi WARN. Coinvolgere il team di prodotto se il consumer ` +
      `non riprende o il crash si ripete. ${RECOVERY_CHECKS}`,
    details: DETAILS,
    level: 'warn',
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'KafkaJSNumberOfRetriesExceeded: consumer in crash; ripresa effettiva da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Necessario confronto con il team di prodotto'],
    },
  }),
  knownCase({
    id: 'catalog-platformstate-writer-temporary-network-errors',
    description: 'Errore di connessione del catalog platformstate writer; temporaneità da verificare',
    priority: 100,
    condition: writerEvidence(
      'ERROR\\s*-\\s*Connection\\s+(?:timeout\\b|error:\\s*(?:Client network socket disconnected before secure TLS connection was established\\b|connect ECONNREFUSED\\b))',
    ),
    resolution:
      `Identificare la controparte effettivamente contattata e distinguere timeout, socket interrotto prima del TLS ` +
      `e connessione rifiutata ECONNREFUSED. Non considerare il fenomeno transitorio senza evidenze successive. ${
        RECOVERY_CHECKS
      }`,
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Timeout, socket TLS interrotto o connessione rifiutata; causa e recupero da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Necessario confronto con il team di prodotto'],
    },
  }),
  knownCase({
    id: 'catalog-platformstate-writer-kafka-coordinator-member-rejoin',
    description: 'Errore di membership o coordinator Kafka del catalog platformstate writer',
    priority: 90,
    condition: writerEvidence(
      '(?:Response Heartbeat\\(key:\\s*12, version:\\s*3\\)\\s*-\\s*(?:The coordinator is not aware of this member\\b|This is not the correct coordinator for this group\\b)|The coordinator is not aware of this member,\\s*re-joining the group\\s*-\\s*The coordinator is not aware of this member\\b)',
    ),
    resolution:
      `Distinguere member non riconosciuto e coordinator non corretto; verificare tentativo di rejoin e risultato. ` +
      `PIN-7325 descrive perdita della sessione per problemi di rete o elaborazione lenta, è ancora aperta ` +
      `e non documenta una correzione definitiva per questo writer. Confermare il collegamento tramite evidenze ` +
      `del servizio; il ticket non sostituisce una verifica operativa. ${RECOVERY_CHECKS}`,
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Il consumer segnala member sconosciuto o coordinator non corretto; ripresa da verificare.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Necessario confronto con il team di prodotto'],
      links: [jiraLink('PIN-7325')],
    },
  }),
];
