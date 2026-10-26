import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'lambda-timeout',
    description: 'Timeout runtime della Lambda',
    priority: 100,
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
  knownCase({
    id: 'lambda-out-of-memory',
    description: 'Out of memory della Lambda',
    priority: 99,
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
