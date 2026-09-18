import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { slackLink } from '../common/analysisLinks.js';
import { interopKnownCase, type InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { AUTHORIZATION_PROCESS_ALARM as alarm } from './alarmDefinition.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};

const ADMINISTRATOR_COMMAND_SLACK = 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1785766750028039';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopKnownCase(REFS, {
    id: 'authorization-process-connection-terminated-by-administrator',
    description: 'Connessione terminata da un comando amministrativo',
    priority: 100,
    regex:
      'Error uncaughtException intercepted; Error detail: error: terminating connection due to administrator command',
    resolution:
      'Il documento non riporta una risoluzione. Correlare il CID con la richiesta del token AWS e verificare con il team di prodotto la causa della terminazione della connessione.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'La connessione è stata terminata da un comando amministrativo durante una richiesta del token AWS.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Correlare la richiesta del token AWS e verificare la terminazione con il team di prodotto'],
    links: [slackLink(ADMINISTRATOR_COMMAND_SLACK, 'Thread Slack 03/08/2026')],
  }),
  interopKnownCase(REFS, {
    id: 'authorization-process-closed-connection-while-sending',
    description: 'Connessione chiusa durante l’invio dei messaggi',
    priority: 90,
    regex: 'Failed to send messages:\\s*Closed connection',
    resolution:
      'Chiusura momentanea documentata durante una richiesta del token AWS. Verificare dai log correlati che il fenomeno sia isolato; se persiste, coinvolgere il team di prodotto.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'La connessione si è chiusa durante l’invio dei messaggi.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Verificare che la chiusura sia isolata e coinvolgere il team di prodotto se persiste'],
  }),
  interopKnownCase(REFS, {
    id: 'authorization-process-kafka-lock-timeout',
    description: 'Timeout durante l’acquisizione del lock Kafka',
    priority: 80,
    regex: 'KafkaJSLockTimeout:\\s*Timeout while acquiring lock',
    resolution:
      'Nessuna azione se si tratta di un singolo evento o di un picco momentaneo. Verificare la persistenza sui log correlati e contattare il team di prodotto se continua.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Timeout della connessione verso il broker Kafka.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Se il timeout persiste, contattare il team di prodotto'],
  }),
  interopKnownCase(REFS, {
    id: 'authorization-process-clients-with-keys-unauthorized',
    description: 'Recupero della chiave pubblica non autorizzato',
    priority: 70,
    regex:
      '(?:clientsWithKeys[^\\n]*401:Unauthorized[^\\n]*Error getting public key|Error getting public key[^\\n]*clientsWithKeys[^\\n]*401:Unauthorized)',
    resolution:
      'Nessuna azione se si tratta di un singolo evento o di un picco momentaneo. Verificare la persistenza della risposta 401 e contattare il team di prodotto se continua.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'La richiesta a clientsWithKeys non è autorizzata e impedisce il recupero della chiave pubblica.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: ['Se le risposte 401 persistono, contattare il team di prodotto'],
  }),
  interopKnownCase(REFS, {
    id: 'authorization-process-duplicate-event-stream-version',
    description: 'Evento duplicato gestito tramite retry',
    priority: 60,
    regex:
      'Error creating event: error: duplicate key value violates unique constraint[^\\n]*events_stream_id_version_key',
    resolution:
      'Nessuna azione: il duplicato può derivare da eventi ravvicinati, non è impattante ed è gestito tramite retry della chiamata.',
    proposedStatus: 'COMPLETED',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Tentativo di inserire una versione di evento già presente.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
  }),
];
