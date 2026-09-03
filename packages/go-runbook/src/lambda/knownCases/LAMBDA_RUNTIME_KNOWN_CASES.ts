import { knownCase } from '../../builders/knownCase.js';
import type { KnownCase } from '../../types/KnownCase.js';

/**
 * Built-in runtime known cases shared by Lambda runbooks (timeout /
 * out-of-memory). Spread into a runbook's `knownCases` when needed:
 * `knownCases: [...LAMBDA_RUNTIME_KNOWN_CASES, ...customCases]`.
 */
export const LAMBDA_RUNTIME_KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'lambda-timeout',
    description: 'Timeout runtime della Lambda',
    priority: 100,
    condition: { type: 'compare', ref: 'vars.lambdaErrorCategory', operator: '==', value: 'timeout' },
    title: 'Timeout Lambda {{vars.lambdaFunctionName}}',
    resolution: 'Verificare il timeout configurato e la Max Concurrency della Lambda.',
    details: [
      ['Duration', '{{vars.lambdaDurationMs}} ms'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      // Richiede una verifica di configurazione: l'occorrenza resta aperta.
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
    },
  }),
  knownCase({
    id: 'lambda-out-of-memory',
    description: 'Out of memory della Lambda',
    priority: 99,
    condition: { type: 'compare', ref: 'vars.lambdaErrorCategory', operator: '==', value: 'out-of-memory' },
    title: 'OutOfMemory Lambda {{vars.lambdaFunctionName}}',
    resolution: 'Aumentare la memoria allocata alla Lambda.',
    details: [
      ['Max Memory Used', '{{vars.lambdaMaxMemoryUsedMb}}/{{vars.lambdaMemorySizeMb}} MB'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      // Serve un intervento di configurazione: l'occorrenza resta aperta.
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
    },
  }),
];
