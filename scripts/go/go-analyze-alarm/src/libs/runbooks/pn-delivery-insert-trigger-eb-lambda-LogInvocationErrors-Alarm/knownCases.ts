/**
 * Known cases for the pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm runbook.
 *
 * The PDF documents a single known case (runtime timeout). It overrides the
 * shared generic timeout case (higher priority) with the documented
 * resolution; the remaining shared runtime cases (out-of-memory) are spread in.
 */

import { lambda } from '@go-automation/go-runbook';
import type { KnownCase } from '@go-automation/go-runbook';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'delivery-insert-trigger-eb-timeout-single-occurrence',
    description: 'Timeout della Lambda pn-delivery-insert-trigger-eb-lambda',
    priority: 110,
    condition: { type: 'compare', ref: 'vars.lambdaErrorCategory', operator: '==', value: 'timeout' },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] Timeout pn-delivery-insert-trigger-eb-lambda\n' +
        'Duration: {{vars.lambdaDurationMs}} ms\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: solitamente occorrenza singola non anomala. Nessuna azione specifica richiesta.\n',
    },
  },
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
];
