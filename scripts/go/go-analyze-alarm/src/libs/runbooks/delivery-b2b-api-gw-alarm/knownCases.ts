/**
 * Known cases for the pn-delivery-b2b-api-gw-alarm runbook.
 *
 * Each entry documents an alarm outcome recognized by this runbook.
 *
 * Matching strategy (see V02 plan §1.4 and §2.2):
 * - all cases discriminate on the microservice error message
 *   (`vars.<service>ErrorMsg`);
 * - the only case allowed to look at `vars.apiGwStatusCode` is
 *   `gateway-timeout-504`, because no microservice log is available to
 *   regex against.
 */

import type { KnownCase } from '@go-automation/go-runbook';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'execution-failed-configuration-error',
    description: 'Allarme',
    priority: 101,
    condition: {
      type: 'contains',
      ref: 'steps.query-api-gw-execution-logs',
      regex: 'Execution failed due to configuration error',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] [EXECUTION LOG] Execution failed due to configuration error\n' +
        'Risoluzione: Chiusura - caso noto\n',
    },
  },
  {
    id: 'downstream-selfcarepg-500-internal-server-error',
    description: 'Allarme',
    priority: 100,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-data-vault',
      regex: '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=500',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] [DOWNSTREAM] Service SelfcarePG returned errors=500 Internal Server Error\n' +
        'Risoluzione: Chiusura - caso noto\n' +
        'Downstream: SelfcarePG\n',
    },
  },
];
