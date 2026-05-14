/**
 * Known cases for the pn-address-book-io-IO-ApiGwAlarm runbook.
 *
 * Each entry mirrors a case documented in the canonical JSON runbook
 * (`go-runbooks/artifacts/send/alarms/apigw/pn-address-book-io-IO-ApiGwAlarm.json`).
 *
 * Matching strategy (see V02 plan §1.4 and §2.2):
 * - all cases discriminate on the microservice error message
 *   (`vars.<service>ErrorMsg`);
 * - the only case allowed to look at `vars.apiGwStatusCode` is
 *   `gateway-timeout-504`, because no microservice log is available to
 *   regex against (504 with `userAttributesLogCount == '0'`).
 */

import type { KnownCase } from '@go-automation/go-runbook';
// 	 m
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'pn-exception-500',
    description: 'Allarme',
    priority: 100,
    condition: {
      type: 'contains',
      ref: 'vars.dataVaultErrorMsg',
      regex: 'pn-exception 500 catched problem=class Problem',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] 500 da AppIO - Internal Server Error\n' +
        'Risoluzione: Chiusura - caso noto\n' +
        'Downstream: AppIO\n',
    },
  },
];
