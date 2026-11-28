import { type KnownError, varEquals } from '../../../../engine/index.js';
import { knownError, lambda } from '../../../../toolkits/send/index.js';
/**
 * Known errors for the pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm runbook.
 *
 * The PDF documents a single known error (runtime timeout). It supersedes the
 * shared generic timeout case with the documented resolution; the remaining
 * shared runtime cases (out-of-memory) are spread in.
 */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_LAMBDA_PDITELLIEA_DEL-INS-TRI-EB-TIM-SIN-OCC',
    description: 'Timeout della Lambda pn-delivery-insert-trigger-eb-lambda',
    supersedes: ['SEND_LAMBDA_COMMON_LAM-TIM'],
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
  ...lambda.LAMBDA_RUNTIME_KNOWN_ERRORS,
];
