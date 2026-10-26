import { lambda, knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';
import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'sender-dashboard-datalake-object-not-found',
    description: 'Oggetto sorgente della Dashboard Mittenti non trovato nel bucket DataLake',
    priority: 130,
    condition: lambdaLogEvidenceMatches('Object not found:\\s*.+\\s+in bucket\\s+.+'),
    title: 'Dashboard Mittenti: oggetto DataLake non trovato',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Uno dei file JSON sorgente non è disponibile nel bucket DataLake configurato.',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'sender-dashboard-datalake-file-too-small',
    description: 'File sorgente della Dashboard Mittenti sotto la soglia minima configurata',
    priority: 120,
    condition: lambdaLogEvidenceMatches('File size is less than the minimum size:\\s*\\d+\\s*bytes'),
    title: 'Dashboard Mittenti: file DataLake vuoto o troppo piccolo',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Almeno uno dei file JSON sorgente è sotto la soglia MIN_BYTES_DATA_LAKE_FILE.',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'sender-dashboard-data-older-than-threshold',
    description: 'I dati della Dashboard Mittenti sono più vecchi della soglia configurata',
    priority: 110,
    condition: lambdaLogEvidenceMatches(
      'No data in the last\\s+\\d+\\s+days\\.\\s*Last data date:\\s*\\d{4}-\\d{2}-\\d{2}',
    ),
    title: 'Dashboard Mittenti: nessun dato recente',
    resolution:
      'Negli ambienti inferiori non \u00E8 richiesta alcuna azione quando non sono presenti nuovi dati da processare. La pagina non indica una risoluzione per la produzione.',
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      // L'alarm name non identifica l'ambiente: serve una verifica umana prima di chiudere.
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'La lastDate dei dati elaborati supera ALARM_N_DAYS (5 nella configurazione verificata).',
      finalActions: [],
      links: [],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
];
