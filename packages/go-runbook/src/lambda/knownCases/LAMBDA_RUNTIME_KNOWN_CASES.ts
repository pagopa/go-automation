import type { KnownCase } from '../../types/KnownCase.js';

/**
 * Built-in runtime known cases shared by Lambda runbooks (timeout /
 * out-of-memory). Spread into a runbook's `knownCases` when needed:
 * `knownCases: [...LAMBDA_RUNTIME_KNOWN_CASES, ...customCases]`.
 */
export const LAMBDA_RUNTIME_KNOWN_CASES: ReadonlyArray<KnownCase> = [
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
];
