/**
 * Known cases for the pn-delivery-B2B-ApiGwAlarm runbook.
 */

import type { KnownCase } from '../framework.js';
import { knownCase } from '../framework.js';
import { SEND_DOWNSTREAMS } from '../framework.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'execution-failed-configuration-error',
    description: 'Allarme',
    priority: 101,
    condition: {
      type: 'contains',
      ref: 'steps.query-api-gw-execution-logs',
      regex: 'Execution failed due to configuration error',
    },
    title: '[EXECUTION LOG] Execution failed due to configuration error',
    resolution: 'Chiusura - caso noto',
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  }),
  knownCase({
    id: 'downstream-selfcarepg-500-internal-server-error',
    description: 'Allarme',
    priority: 100,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-data-vault',
      regex: '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=500',
    },
    title: '[DOWNSTREAM] Service SelfcarePG returned errors=500 Internal Server Error',
    resolution: 'Chiusura - caso noto',
    details: [['Downstream', 'SelfcarePG']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
    },
  }),
];
