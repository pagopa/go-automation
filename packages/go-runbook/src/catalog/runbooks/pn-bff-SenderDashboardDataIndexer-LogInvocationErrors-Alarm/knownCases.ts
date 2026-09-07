import { lambda, knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';

const DATALAKE_RECOVERY_RESOLUTION =
  'Verificare che senderDashboardIndex.json sia valido e, se necessario, ripristinarne una versione precedente. ' +
  'Chiedere la rigenerazione del file al team DataLake sul canale #team_notifiche_datalake, rieseguire la Lambda ' +
  'e verificare la generazione del nuovo indice; se il problema persiste, coinvolgere il team BE di pn-bff.';

const DATALAKE_RECOVERY_ACTIONS = [
  'Verificare senderDashboardIndex.json e ripristinare una versione valida se necessario',
  'Richiedere al team DataLake la rigenerazione del file sorgente',
  'Rieseguire pn-bff-SenderDashboardDataIndexer e verificare il nuovo indice',
] as const;

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'sender-dashboard-datalake-object-not-found',
    description: 'Oggetto sorgente della Dashboard Mittenti non trovato nel bucket DataLake',
    priority: 130,
    condition: lambdaLogEvidenceMatches('Object not found:\\s*.+\\s+in bucket\\s+.+'),
    title: 'Dashboard Mittenti: oggetto DataLake non trovato',
    resolution: DATALAKE_RECOVERY_RESOLUTION,
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Uno dei file JSON sorgente non è disponibile nel bucket DataLake configurato.',
      finalActions: DATALAKE_RECOVERY_ACTIONS,
    },
  }),
  knownCase({
    id: 'sender-dashboard-datalake-file-too-small',
    description: 'File sorgente della Dashboard Mittenti sotto la soglia minima configurata',
    priority: 120,
    condition: lambdaLogEvidenceMatches('File size is less than the minimum size:\\s*\\d+\\s*bytes'),
    title: 'Dashboard Mittenti: file DataLake vuoto o troppo piccolo',
    resolution: DATALAKE_RECOVERY_RESOLUTION,
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Almeno uno dei file JSON sorgente è sotto la soglia MIN_BYTES_DATA_LAKE_FILE.',
      finalActions: DATALAKE_RECOVERY_ACTIONS,
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
      'Negli ambienti inferiori nessuna azione è richiesta quando i file di test non contengono dati recenti. ' +
      'In produzione verificare la freschezza dei due file DataLake e dell’indice S3; la pagina corrente non ' +
      'documenta una chiusura automatica per la produzione.',
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      // L'alarm name non identifica l'ambiente: serve una verifica umana prima di chiudere.
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'La lastDate dei dati elaborati supera ALARM_N_DAYS (5 nella configurazione verificata).',
      finalActions: [
        'Identificare l’ambiente da cui proviene l’allarme',
        'In produzione verificare la freschezza dei file DataLake e dell’indice S3',
      ],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
];
