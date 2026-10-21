import { varEquals } from '../common/varConditions.js';
/**
 * Known cases for the pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm runbook.
 *
 * The PDF documents a single known case (runtime timeout). It overrides the
 * shared generic timeout case (higher priority) with the documented
 * resolution; the remaining shared runtime cases (out-of-memory) are spread in.
 */
import { lambda } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'delivery-insert-trigger-eb-timeout-single-occurrence',
    description: 'Timeout della Lambda pn-delivery-insert-trigger-eb-lambda',
    priority: 110,
    condition: varEquals('lambdaErrorCategory', 'timeout'),
    title: 'Timeout pn-delivery-insert-trigger-eb-lambda',
    resolution: 'Il runbook descrive occorrenze singole per le quali non \u00E8 richiesta un\u2019azione specifica.',
    details: [
      ['Duration', '{{vars.lambdaDurationMs}} ms'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
];
