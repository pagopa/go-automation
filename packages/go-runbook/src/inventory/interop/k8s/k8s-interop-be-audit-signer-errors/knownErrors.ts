import { interopK8sKnownError, type InteropK8sKnownErrorRefs } from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';

import { AUDIT_SIGNER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBASE_AUD-SIG-SAF-STO-UPL-500-503',
    description: 'Errore HTTP 500 o 503 durante l’upload del contenuto su Safe Storage',
    environments: ['prod'],
    regex:
      'Error processing message: Error: Error uploading file content on safe storage, details: AxiosError: Request failed with status code (?:500|503)\\b',
    evidence: 'APPLICATION_LOGS',
    resolution:
      'Recuperare dai log il nome del file NDJSON. Scaricare l\u2019originale da interop-generated-jwt-details-<env>-es1, percorso token-details/<YYYYMMDD>/<file>.ndjson, e il relativo archivio da interop-signed-jwt-audit-v2-<env>-es1, percorso token-details/<YYYYMMDD>/<file>.ndjson.zip.p7m. Estrarre il contenuto p7m con openssl cms e decomprimere lo ZIP. Confrontare con md5sum l\u2019NDJSON estratto e l\u2019originale: se gli hash coincidono, il runbook considera il problema temporaneo e gestito dal sistema.',
    extraDetails: [
      ['Verifica richiesta', 'Confronto dei contenuti originali ed estratti per tutti i file interessati'],
    ],
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Upload del contenuto su Safe Storage fallito con HTTP 500/503; recupero da verificare sui file.',
    // Safe Storage non è presente nel catalogo downstream INTEROP: non attribuire "Nessuno" o una voce inventata.
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1782220704023239',
        name: 'Discussione Safe Storage 23/06/2026',
        type: 'SLACK',
      },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784042414414819',
        name: 'Discussione Safe Storage 14/07/2026',
        type: 'SLACK',
      },
    ],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBASE_AUD-SIG-SAF-STO-CRE-TIM',
    description: 'Timeout di 30 secondi nella creazione del file su Safe Storage',
    environments: ['prod'],
    regex:
      'Error processing message: Error: Error creating file on safe storage, details: AxiosError: timeout of 30000ms exceeded',
    evidence: 'APPLICATION_LOGS',
    resolution:
      'Verificare nei log successivi del microservizio se il retry ha avuto esito positivo. Se il retry fallisce o non viene eseguito, segnalare il caso.',
    extraDetails: [['Verifica richiesta', 'Esito del retry correlato allo stesso file']],
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Creazione del file su Safe Storage in timeout dopo 30000 ms; esito del retry da verificare.',
    finalActions: [],
    links: [],
  }),
];
