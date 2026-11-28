import { knownError } from '../../../../toolkits/send/index.js';
import type { KnownError } from '../../../../engine/index.js';

export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_LAMBDA_PSVCLSQSLIEA_LAM-TIM',
    description: 'Timeout runtime della Lambda',
    condition: {
      type: 'compare',
      ref: 'vars.lambdaErrorCategory',
      operator: '==',
      value: 'timeout',
    },
    title: 'Timeout Lambda {{vars.lambdaFunctionName}}',
    resolution:
      'PN-19957: nel caso documentato il timeout è stato aumentato temporaneamente da 10 a 15 secondi. Riferimento al thread Slack del 14/05/2026.',
    level: 'info',
    details: [
      ['Duration', '{{vars.lambdaDurationMs}} ms'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_LAMBDA_PSVCLSQSLIEA_LAM-OUT-OF-MEM',
    description: 'Out of memory della Lambda',
    condition: {
      type: 'compare',
      ref: 'vars.lambdaErrorCategory',
      operator: '==',
      value: 'out-of-memory',
    },
    title: 'OutOfMemory Lambda {{vars.lambdaFunctionName}}',
    resolution: 'Risoluzione non documentata.',
    level: 'info',
    details: [
      ['Max Memory Used', '{{vars.lambdaMaxMemoryUsedMb}}/{{vars.lambdaMemorySizeMb}} MB'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
];
