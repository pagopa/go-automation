/**
 * Known cases for the pn-ioAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 *
 * Shared runtime cases (timeout / out-of-memory) are spread in from
 * `lambda.LAMBDA_RUNTIME_KNOWN_CASES`; the cases below are alarm-specific,
 * matched on the log rows.
 */
import { lambda } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';
import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  knownCase({
    id: 'iam-policy-socket-hang-up',
    description: 'Errore generazione IAM policy verso pn-data-vault (socket hang up)',
    priority: 90,
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
  knownCase({
    id: 'invalid-source-details-qrcode',
    description: 'Header source details QRCODE non valido',
    priority: 89,
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
