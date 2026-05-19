/**
 * Known cases for the pn-delivery-IO_EXP-ApiGwAlarm runbook.
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
    id: 'downstream-pdv-500-internal-server-error',
    description: 'Allarme',
    priority: 100,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-data-vault',
      regex: '\\[DOWNSTREAM\\] Service PersonalDataVault_UserRegistry returned errors=500 Internal Server Error',
    },
    action: {
      type: 'log',
      level: 'info',
      message:
        '[CASO NOTO] [DOWNSTREAM] Service PersonalDataVault_UserRegistry returned errors=500 Internal Server Error\n' +
        'Risoluzione: Chiusura - caso noto\n' +
        'Downstream: PersonalDataVault\n',
    },
  },
];
