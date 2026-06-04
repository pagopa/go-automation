/**
 * Known cases for the pn-tokenExchangeLambda-LogInvocationErrors-Alarm runbook.
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
        'Duration: {{vars.lambdaDurationMs}} ms\n' +
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
    id: 'emd-retrieval-id-size',
    description: '[DOWNSTREAM pn-emd-integration] retrievalId con dimensione non valida (HTTP 400)',
    priority: 90,
    condition: {
      type: 'or',
      conditions: [
        { type: 'contains', ref: 'steps.query-lambda-invocation', regex: 'size must be between 50 and 50' },
        { type: 'contains', ref: 'steps.query-lambda-errors', regex: 'size must be between 50 and 50' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM pn-emd-integration] retrievalId: size must be between 50 and 50 (HTTP 400)\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: TBD - vedi thread Slack del 20/04/2026.\n',
    },
  },
  {
    id: 'emd-get-retrieval-id-ko',
    description: '[DOWNSTREAM pn-emd-integration] impossibile individuare il retrievalId (HTTP 404)',
    priority: 89,
    condition: {
      type: 'or',
      conditions: [
        { type: 'contains', ref: 'steps.query-lambda-invocation', regex: 'Error in get retrievalId' },
        { type: 'contains', ref: 'steps.query-lambda-errors', regex: 'Error in get retrievalId' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM pn-emd-integration] GenerateKoResponse: Error in get retrievalId (HTTP 404)\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: nessuna azione - il servizio non è ancora abilitato ([Service disabled]).\n',
    },
  },
  {
    id: 'emd-get-retrieval-payload-ko',
    description: '[DOWNSTREAM pn-emd-integration] errore nel recupero del retrieval payload (HTTP 404)',
    priority: 88,
    condition: {
      type: 'or',
      conditions: [
        { type: 'contains', ref: 'steps.query-lambda-invocation', regex: 'Error getting retrieval payload' },
        { type: 'contains', ref: 'steps.query-lambda-errors', regex: 'Error getting retrieval payload' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM pn-emd-integration] Ending process _tokenCheckTPP: Error getting retrieval payload (HTTP 404)\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: nessuna azione - servizio non ancora in funzione ([Service disabled]). Da confermare.\n',
    },
  },
];
