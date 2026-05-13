/**
 * Runbook: pn-address-book-io-IO-ApiGwAlarm
 *
 * Analyses API Gateway alarms for the pn-user-attributes microservice
 * by orchestrating the canonical API GW pipeline (see
 * {@link apigw.createApiGwAlarmRunbook}) over the chain:
 *
 *   pn-user-attributes → pn-data-vault → pn-external-registries
 *
 * The chain is **dynamic**: only `pn-user-attributes` is reached by
 * default (entry service); the other services are entered when a
 * {@link apigw.KnownUrl} resolved during analysis points to them.
 *
 * Custom Livello 0 lambda probe on `pn-ioAuthorizerLambda` runs before
 * the per-service pipeline (see {@link IO_AUTHORIZER_PRE_STEPS}).
 */

import { apigw } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';
import { IO_AUTHORIZER_PRE_STEPS } from './preSteps.js';

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
    preSteps: IO_AUTHORIZER_PRE_STEPS,
    knownCases: KNOWN_CASES,
  });
}
