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

import { API_GW_LOG_GROUP, ENTRY_SERVICE, KNOWN_URLS, REACHABLE_SERVICES } from './constants.js';
import { KNOWN_CASES } from './knownCases.js';
import { IO_AUTHORIZER_PRE_STEPS } from './preSteps.js';

/**
 * Builds the pn-address-book-io-IO-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildAddressBookIoApiGwAlarmRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-address-book-io-IO-ApiGwAlarm',
    metadata: {
      name: 'ANALISI ALLARME pn-address-book-io-IO-ApiGwAlarm',
      description: 'Analizza gli allarmi API Gateway del microservizio pn-user-attributes',
      version: '3.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['api-gateway', 'pn-user-attributes', 'pn-data-vault', 'pn-external-registries', 'pn-ioAuthorizerLambda'],
    },
    apiGwLogGroup: API_GW_LOG_GROUP,
    entryService: ENTRY_SERVICE,
    services: REACHABLE_SERVICES,
    knownUrls: KNOWN_URLS,
    preSteps: IO_AUTHORIZER_PRE_STEPS,
    knownCases: KNOWN_CASES,
  });
}
