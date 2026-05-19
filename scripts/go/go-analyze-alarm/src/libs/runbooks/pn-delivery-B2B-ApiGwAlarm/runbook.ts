/**
 * Runbook: pn-delivery-B2B-ApiGwAlarm
 */

import { apigw } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-delivery-B2B-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildDeliveryB2BApiGwAlarmRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-delivery-B2B-ApiGwAlarm',
    metadata: {
      name: 'ANALISI ALLARME pn-delivery-B2B-ApiGwAlarm',
      description: '',
      version: '3.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    apiGwLogGroup: API_GW_LOG_GROUP,
    entryService: ENTRY_SERVICE,
    services: REACHABLE_SERVICES,
    knownUrls: KNOWN_URLS,
    knownCases: KNOWN_CASES,
  });
}
