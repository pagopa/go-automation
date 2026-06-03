/**
 * Known cases for the pn-ioAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 */

import type { KnownCase } from '@go-automation/go-runbook';

/**
 * Known cases evaluated against the resulting context, highest priority
 * first.
 *
 * The engine classifies the error into `vars.lambdaErrorCategory`
 * (`timeout` / `out-of-memory` / `throttle` / `downstream` /
 * `application-error`); the two runtime cases below match on it. Add
 * alarm-specific cases that match on the log rows via `contains` regex on
 * `steps.query-lambda-errors` or `steps.query-lambda-invocation`.
 */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'lambda-timeout',
    description: 'Timeout runtime della Lambda',
    priority: 100,
    condition: { type: 'compare', ref: 'vars.lambdaErrorCategory', operator: '==', value: 'timeout' },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] Timeout Lambda {{vars.lambdaFunctionName}}\n' +
        'Duration: {{vars.lambdaDurationMs}} ms - Status: {{vars.lambdaRuntimeStatus}}\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: verificare timeout e Max Concurrency della Lambda.\n',
    },
  },
  {
    id: 'lambda-out-of-memory',
    description: 'Out of memory della Lambda',
    priority: 99,
    condition: { type: 'compare', ref: 'vars.lambdaErrorCategory', operator: '==', value: 'out-of-memory' },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] OutOfMemory Lambda {{vars.lambdaFunctionName}}\n' +
        'Max Memory Used: {{vars.lambdaMaxMemoryUsedMb}}/{{vars.lambdaMemorySizeMb}} MB\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: aumentare la memoria allocata alla Lambda.\n',
    },
  },
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
