import { knownCase, lambda } from '../framework.js';
import type { Condition, KnownCase } from '../framework.js';

import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';

/** A timeout or OOM must take precedence even when the scan also finds a quarantine line. */
function withoutRuntimeFailure(condition: Condition): Condition {
  return {
    type: 'and',
    conditions: [
      condition,
      {
        type: 'not',
        condition: { type: 'compare', ref: 'vars.lambdaErrorCategory', operator: '==', value: 'timeout' },
      },
      {
        type: 'not',
        condition: { type: 'compare', ref: 'vars.lambdaErrorCategory', operator: '==', value: 'out-of-memory' },
      },
    ],
  };
}

const QUARANTINE_SIGNATURE =
  'Record routed to quarantine[\\s\\S]*Result=Ok[\\s\\S]*ProcessingLayer=quarantine' +
  '[\\s\\S]*TableName=pn-UserAttributes[\\s\\S]*ImageSource=NewImage[\\s\\S]*Errors=';

const QUARANTINE_RESOLUTION =
  'Il record è stato instradato in quarantena con Result=Ok: il controllo di qualità ha prodotto un esito ' +
  'funzionale, non una conferma di errore tecnico della Lambda. Il metric filter UAT conta anche questi log ' +
  'come ERROR: verificare quale metrica dell’allarme è salita, poi ambiente, EventID, codice DQ e presenza ' +
  'di altri ERROR, PROCESSING_FAILED o REPORT anomali prima di concludere l’analisi. La pagina ' +
  'operativa del 25/08/2026 descrive il caso solo in UAT: non applicare automaticamente tale indicazione ' +
  'ad altri ambienti.';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'cdc-preproc-processing-failed',
    description: 'Errore tecnico PROCESSING_FAILED durante il preprocessing CDC',
    priority: 140,
    condition: withoutRuntimeFailure(
      lambdaLogEvidenceMatches('PROCESSING_FAILED[\\s\\S]*Technical error during record processing'),
    ),
    title: 'CDC preprocessing: errore tecnico',
    resolution:
      'Verificare RecordID ed ErrorType nel log, il contatore Failed del batch e il percorso di errore Firehose. ' +
      'Confermare che il record sia recuperabile e coinvolgere il responsabile del componente per la correzione.',
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'La Lambda ha segnalato un errore tecnico di preprocessing; il record può avere esito ProcessingFailed.',
      finalActions: [
        'Controllare RecordID, ErrorType e il contatore Failed del batch',
        'Verificare il percorso di errore Firehose e la recuperabilità del record',
      ],
    },
  }),
  knownCase({
    id: 'cdc-preproc-invalid-consents-quarantine',
    description: 'Record pn-UserAttributes in quarantena per DQ_INVALID_CONSENTS',
    priority: 120,
    condition: withoutRuntimeFailure(
      lambdaLogEvidenceMatches(`${QUARANTINE_SIGNATURE}[\\s\\S]*DQ_INVALID_CONSENTS[\\s\\S]*check_invalid_consents`),
    ),
    title: 'CDC data quality: consensi non validi',
    resolution: QUARANTINE_RESOLUTION,
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Record pn-UserAttributes instradato in quarantena dal controllo DQ_INVALID_CONSENTS.',
      finalActions: [
        'Distinguere la metrica dei log ERROR dalla metrica AWS/Lambda Errors nell’allarme',
        'Identificare l’ambiente e correlare l’EventID del record in quarantena',
        'Verificare se nello stesso intervallo sono presenti errori tecnici distinti',
      ],
    },
  }),
  knownCase({
    id: 'cdc-preproc-other-dq-quarantine',
    description: 'Record pn-UserAttributes in quarantena per un altro controllo di qualità',
    priority: 110,
    condition: withoutRuntimeFailure(lambdaLogEvidenceMatches(QUARANTINE_SIGNATURE)),
    title: 'CDC data quality: record in quarantena',
    resolution: QUARANTINE_RESOLUTION,
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Record pn-UserAttributes instradato in quarantena con Result=Ok; codice DQ da identificare.',
      finalActions: [
        'Distinguere la metrica dei log ERROR dalla metrica AWS/Lambda Errors nell’allarme',
        'Identificare ambiente, EventID e codice del controllo DQ',
        'Verificare se nello stesso intervallo sono presenti errori tecnici distinti',
      ],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
];
