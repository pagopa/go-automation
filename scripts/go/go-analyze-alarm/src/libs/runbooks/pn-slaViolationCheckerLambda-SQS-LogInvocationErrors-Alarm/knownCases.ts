/**
 * Known cases for the pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm runbook.
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
        'Risoluzione: PN-19957 - impostare Max Concurrency e verificare il timeout della Lambda (workaround applicato: 10s -> 15s).\n',
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
];
