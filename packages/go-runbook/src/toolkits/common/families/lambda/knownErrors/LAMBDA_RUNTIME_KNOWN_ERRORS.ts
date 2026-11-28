import { knownError } from '../../../analysis/knownError.js';
import type { KnownError } from '../../../../../engine/index.js';

/**
 * Built-in runtime known errors shared by Lambda runbooks (timeout /
 * out-of-memory). Spread into a runbook's `knownErrors` when needed:
 * `knownErrors: [...LAMBDA_RUNTIME_KNOWN_ERRORS, ...customCases]`.
 */
export const LAMBDA_RUNTIME_KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_LAMBDA_COMMON_LAM-TIM',
    description: 'Timeout runtime della Lambda',
    condition: { type: 'compare', ref: 'vars.lambdaErrorCategory', operator: '==', value: 'timeout' },
    title: 'Timeout Lambda {{vars.lambdaFunctionName}}',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Duration', '{{vars.lambdaDurationMs}} ms'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
    },
  }),
  knownError({
    code: 'SEND_LAMBDA_COMMON_LAM-OUT-OF-MEM',
    description: 'Out of memory della Lambda',
    condition: { type: 'compare', ref: 'vars.lambdaErrorCategory', operator: '==', value: 'out-of-memory' },
    title: 'OutOfMemory Lambda {{vars.lambdaFunctionName}}',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Max Memory Used', '{{vars.lambdaMaxMemoryUsedMb}}/{{vars.lambdaMemorySizeMb}} MB'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
    },
  }),
];
