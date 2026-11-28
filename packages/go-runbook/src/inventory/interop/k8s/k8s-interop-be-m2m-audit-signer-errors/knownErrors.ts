import { interopK8sKnownError, type InteropK8sKnownErrorRefs } from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';

import { M2M_AUDIT_SIGNER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
const MANUAL_VERIFICATION =
  'Recuperare dai log il nome del file NDJSON. Scaricare l’originale da interop-generated-m2m-jwt-details-<env>-es1, percorso token-details/<YYYYMMDD>/<file>.ndjson, e il relativo archivio da interop-signed-m2m-jwt-audit-v2-<env>-es1, percorso token-details/<YYYYMMDD>/<file>.ndjson.zip.p7m. Estrarre il contenuto p7m con openssl cms e decomprimere lo ZIP. Confrontare con md5sum l’NDJSON estratto e l’originale.';
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBM2ASE_M2M-AUD-SIG-SAF-STO-UPL-500-503',
    description: 'Errore HTTP 500 o 503 durante l’upload del contenuto su Safe Storage',
    environments: ['prod', 'test'],
    regex:
      'Error: Error uploading file content on safe storage, details: AxiosError: Request failed with status code (?:500|503)\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: `Usare lo script interop-token-hash-verification oppure la verifica manuale. ${MANUAL_VERIFICATION} Se gli hash coincidono, l’errore è temporaneo e gestito in autonomia dal sistema.`,
    extraDetails: [
      ['Verifica richiesta', 'Confronto dei contenuti originali ed estratti per tutti i file interessati'],
    ],
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Upload del contenuto su Safe Storage fallito con HTTP 500/503; recupero da verificare sui file.',
    finalActions: [],
    links: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBM2ASE_M2M-AUD-SIG-SAF-STO-CRE-TIM',
    description: 'Timeout di 30 secondi nella creazione del file su Safe Storage',
    environments: ['test'],
    regex: 'Error: Error creating file on safe storage, details: AxiosError: timeout of 30000ms exceeded',
    evidence: 'APPLICATION_LOGS',
    resolution:
      'Verificare nei log successivi del microservizio se il retry sullo stesso file ha avuto esito positivo.',
    extraDetails: [['Verifica richiesta', 'Esito del retry correlato allo stesso file']],
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Creazione del file su Safe Storage in timeout dopo 30000 ms; esito del retry da verificare.',
    finalActions: [],
    links: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBM2ASE_M2M-AUD-SIG-SAF-STO-CRE-500',
    description: 'Errore HTTP 500 nella creazione del file su Safe Storage',
    environments: ['test'],
    regex: 'Error: Error creating file on safe storage, details: AxiosError: Request failed with status code 500\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: `Eseguire la verifica manuale. ${MANUAL_VERIFICATION} Se il file p7m non è presente nel bucket interop-signed-m2m-jwt-audit-v2-<env>-es1, segnalare il caso al team di prodotto.`,
    extraDetails: [['Verifica richiesta', 'Presenza del file p7m e confronto con l’NDJSON originale']],
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Creazione del file su Safe Storage fallita con HTTP 500; presenza del file firmato da verificare.',
    finalActions: [],
    links: [
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1793287925844029',
        name: 'Thread Slack 29/10/2026',
        type: 'SLACK',
      },
    ],
  }),
];
