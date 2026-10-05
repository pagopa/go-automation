import { knownCase, type KnownCase } from '../framework.js';
import { slackLink } from '../common/analysisLinks.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { varEquals } from '../common/varConditions.js';
import { AUDIT_SIGNER_ALARM as alarm } from './alarmDefinition.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'audit-signer-safe-storage-upload-500-503',
    description: 'Errore HTTP 500 o 503 durante l’upload del contenuto su Safe Storage',
    priority: 100,
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'Error processing message: Error: Error uploading file content on safe storage, details: AxiosError: Request failed with status code (?:500|503)\\b',
      ),
    ),
    resolution:
      'Individuare nei log dell’audit signer il file .ndjson e la data associati all’errore, usando il CID se presente. ' +
      'In Prod scaricare l’originale da interop-generated-jwt-details-prod-es1, chiave token-details/<YYYYMMDD>/<file>.ndjson, ' +
      'e il corrispondente .ndjson.zip.p7m da interop-signed-jwt-audit-v2-prod-es1. ' +
      'Estrarre il contenuto PKCS#7, decomprimere lo ZIP e confrontare l’hash dell’NDJSON estratto con quello originale ' +
      '(script interop-verifica-hash-token disponibile nel repository). ' +
      'Documentare bucket, chiavi e hash per ogni file interessato: solo la corrispondenza dei contenuti del file corretto ' +
      'consente di considerare il caso transitorio e recuperato secondo il runbook. ' +
      'L’estrazione e il confronto non attestano la validità della firma o del certificato. ' +
      'Se il file non è identificabile, un oggetto manca o gli hash differiscono, proseguire l’indagine con il team di prodotto. ' +
      'L’analisi automatica dei log non esegue questo controllo S3 e resta aperta fino alla verifica.',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
      ['Verifica richiesta', 'Confronto dei contenuti originali ed estratti per tutti i file interessati'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Upload del contenuto su Safe Storage fallito con HTTP 500/503; recupero da verificare sui file.',
      // Safe Storage non è presente nel catalogo downstream INTEROP: non attribuire "Nessuno" o una voce inventata.
      finalActions: ['Confrontare gli hash dei file corrispondenti e allegare le evidenze prima di chiudere il caso'],
      links: [
        slackLink(
          'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1782220704023239',
          'Discussione Safe Storage 23/06/2026',
        ),
        slackLink(
          'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784042414414819',
          'Discussione Safe Storage 14/07/2026',
        ),
      ],
    },
  }),
  knownCase({
    id: 'audit-signer-safe-storage-create-timeout',
    description: 'Timeout di 30 secondi nella creazione del file su Safe Storage',
    priority: 90,
    condition: all(
      varEquals('interopEnvironment', 'prod'),
      stepEvidenceMatches(
        alarm.stepIds.queryApplicationLogs,
        'Error processing message: Error: Error creating file on safe storage, details: AxiosError: timeout of 30000ms exceeded',
      ),
    ),
    resolution:
      'Verificare nei log successivi dell’audit signer l’esito del retry relativo allo stesso file e, se presente, allo stesso CID. ' +
      'Il tracker raccoglie anche i log non ERROR: ampliare l’intervallo oltre il minuto successivo all’allarme se il retry ' +
      'non è ancora visibile. In assenza di CID cercare per file, timestamp e pod dell’audit signer. ' +
      'Allegare l’evidenza del retry riuscito prima di considerare l’evento recuperato. ' +
      'Se il retry fallisce o il suo esito non è verificabile, segnalare il caso al team di prodotto. ' +
      'La pagina non specifica il messaggio di successo, il tempo massimo di attesa o il destinatario dell’escalation: ' +
      'il solo timeout non permette una chiusura automatica.',
    details: [
      ['Ambiente', '{{vars.interopEnvironment}}'],
      ['Log group', '{{vars.interopLogGroup}}'],
      ['Servizio', '{{vars.interopPodApp}}'],
      ['CID analizzati', `{{vars.${alarm.varPrefix}CidCount}}`],
      ['Verifica richiesta', 'Esito del retry correlato allo stesso file'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Creazione del file su Safe Storage in timeout dopo 30000 ms; esito del retry da verificare.',
      finalActions: [
        'Verificare il retry sullo stesso file e segnalare al team di prodotto se fallito o non verificabile',
      ],
    },
  }),
];
