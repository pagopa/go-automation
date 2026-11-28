import {
  INTEROP_DOWNSTREAMS,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';

import { AUTHORIZATION_PROCESS_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBAPE_AUT-PRO-CON-TER-BY-ADM',
    description: 'Connessione terminata da un comando amministrativo',
    regex:
      'Error uncaughtException intercepted; Error detail: error: terminating connection due to administrator command',
    resolution: 'Thread Slack 03/08/2026',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'La connessione è stata terminata da un comando amministrativo durante una richiesta del token AWS.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1785766750028039',
        name: 'Thread Slack 03/08/2026',
        type: 'SLACK',
      },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBAPE_AUT-PRO-CLO-CON-WHI-SEN',
    description: 'Connessione chiusa durante l’invio dei messaggi',
    regex: 'Failed to send messages:\\s*Closed connection',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'La connessione si è chiusa durante l’invio dei messaggi.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBAPE_AUT-PRO-KAF-LOC-TIM',
    description: 'Timeout durante l’acquisizione del lock Kafka',
    regex: 'KafkaJSLockTimeout:\\s*Timeout while acquiring lock',
    resolution: 'Nessuna azione in caso di singolo evento/momentaneo picco di eventi.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Timeout della connessione verso il broker Kafka.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBAPE_AUT-PRO-CLI-WIT-KEY-UNA',
    description: 'Recupero della chiave pubblica non autorizzato',
    regex:
      '(?:clientsWithKeys[^\\n]*401:Unauthorized[^\\n]*Error getting public key|Error getting public key[^\\n]*clientsWithKeys[^\\n]*401:Unauthorized)',
    resolution: 'Nessuna azione in caso di singolo evento/momentaneo picco di eventi.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'La richiesta a clientsWithKeys non è autorizzata e impedisce il recupero della chiave pubblica.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBAPE_AUT-PRO-DUP-EVE-STR-VER',
    description: 'Evento duplicato gestito tramite retry',
    regex:
      'Error creating event: error: duplicate key value violates unique constraint[^\\n]*events_stream_id_version_key',
    resolution: 'Risoluzione non documentata.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Tentativo di inserire una versione di evento già presente.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [],
  }),
];
