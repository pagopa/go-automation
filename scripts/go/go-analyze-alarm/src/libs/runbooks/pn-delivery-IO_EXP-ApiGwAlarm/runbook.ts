/**
 * Runbook: pn-delivery-IO_EXP-ApiGwAlarm
 *
 * Analyses API Gateway alarms for the pn-delivery IO_EXP public API
 * by orchestrating the canonical API GW pipeline (see
 * {@link apigw.createApiGwAlarmRunbook}) over the chain:
 *
 *   pn-delivery → pn-data-vault
 *
 * The chain is **dynamic**: only `pn-delivery` is reached by
 * default (entry service); the other services are entered when a
 * {@link apigw.KnownUrl} resolved during analysis points to them.
 *
 * The SEND query profile may add profile-level pre-steps before the
 * per-service pipeline.
 */

import { apigw } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-delivery-IO_EXP-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildDeliveryIoExpApiGwAlarmRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-delivery-IO_EXP-ApiGwAlarm',
    metadata: {
      name: 'ANALISI ALLARME pn-delivery-IO_EXP-ApiGwAlarm',
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
