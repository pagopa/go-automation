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
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'cdc-preproc-processing-failed',
    description: 'Errore tecnico PROCESSING_FAILED durante il preprocessing CDC',
    priority: 140,
    condition: withoutRuntimeFailure(
      lambdaLogEvidenceMatches('PROCESSING_FAILED[\\s\\S]*Technical error during record processing'),
    ),
    title: 'CDC preprocessing: errore tecnico',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'La Lambda ha segnalato un errore tecnico di preprocessing; il record può avere esito ProcessingFailed.',
      finalActions: [],
      links: [],
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
    resolution:
      'La pagina del 25/08/2026 non indica una risoluzione e descrive l\u2019allarme solo in UAT; a quella data la funzionalit\u00E0 era disattivata in produzione.',
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Record pn-UserAttributes instradato in quarantena dal controllo DQ_INVALID_CONSENTS.',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'cdc-preproc-other-dq-quarantine',
    description: 'Record pn-UserAttributes in quarantena per un altro controllo di qualità',
    priority: 110,
    condition: withoutRuntimeFailure(lambdaLogEvidenceMatches(QUARANTINE_SIGNATURE)),
    title: 'CDC data quality: record in quarantena',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Errore', '{{vars.lastErrorMsg}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Record pn-UserAttributes instradato in quarantena con Result=Ok; codice DQ da identificare.',
      finalActions: [],
      links: [],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
];
