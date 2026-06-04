/**
 * Known cases for the pn-ioAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 *
 * Shared runtime cases (timeout / out-of-memory) are spread in from
 * `lambda.LAMBDA_RUNTIME_KNOWN_CASES`; the cases below are alarm-specific,
 * matched on the log rows.
 */

import { lambda } from '@go-automation/go-runbook';
import type { KnownCase } from '@go-automation/go-runbook';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  {
    id: 'iam-policy-socket-hang-up',
    description: 'Errore generazione IAM policy verso pn-data-vault (socket hang up)',
    priority: 90,
    condition: {
      type: 'or',
      conditions: [
        { type: 'contains', ref: 'steps.query-lambda-invocation', regex: 'socket hang up' },
        { type: 'contains', ref: 'steps.query-lambda-errors', regex: 'socket hang up' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] Error generating IAM policy: socket hang up verso pn-data-vault\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: occorrenza singola, interruzione momentanea di connessione con pn-data-vault. Nessuna azione.\n',
    },
  },
  {
    id: 'invalid-source-details-qrcode',
    description: 'Header source details QRCODE non valido',
    priority: 89,
    condition: {
      type: 'or',
      conditions: [
        { type: 'contains', ref: 'steps.query-lambda-invocation', regex: 'Invalid source details header QRCODE' },
        { type: 'contains', ref: 'steps.query-lambda-errors', regex: 'Invalid source details header QRCODE' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] Invalid source details header QRCODE\n' +
        'Risoluzione: header della richiesta non valido pervenuto alla Lambda authorizer. Nessuna azione.\n',
    },
  },
];
