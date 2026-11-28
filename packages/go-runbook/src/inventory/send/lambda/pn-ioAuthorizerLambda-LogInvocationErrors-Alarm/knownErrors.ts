/**
 * Known errors for the pn-ioAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 *
 * Shared runtime cases (timeout / out-of-memory) are spread in from
 * `lambda.LAMBDA_RUNTIME_KNOWN_ERRORS`; the cases below are alarm-specific,
 * matched on the log rows.
 */
import { knownError, lambda, lambdaLogEvidenceMatches } from '../../../../toolkits/send/index.js';
import type { KnownError } from '../../../../engine/index.js';
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  ...lambda.LAMBDA_RUNTIME_KNOWN_ERRORS,
  knownError({
    code: 'SEND_LAMBDA_PIALLIEA_IAM-POL-SOC-HAN-UP',
    description: 'Errore generazione IAM policy verso pn-data-vault (socket hang up)',
    condition: lambdaLogEvidenceMatches('socket hang up'),
    title: 'Error generating IAM policy: socket hang up verso pn-data-vault',
    resolution: 'Occorrenza singola per la quale non si \u00E8 deciso di procedere con qualche azione in particolare.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_LAMBDA_PIALLIEA_INV-SOU-DET-QRC',
    description: 'Header source details QRCODE non valido',
    condition: lambdaLogEvidenceMatches('Invalid source details header QRCODE'),
    title: 'Invalid source details header QRCODE',
    resolution: 'Errore per il quale non \u00E8 necessario procedere con qualche azione in particolare.',
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
];
