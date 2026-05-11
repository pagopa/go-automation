/**
 * Runbook: pn-delivery-B2B-ApiGwAlarm
 *
 * Analyses API Gateway alarms for the pn-delivery microservice (B2B
 * channel) by orchestrating the canonical API GW pipeline (see
 * {@link apigw.createApiGwAlarmRunbook}) over the chain:
 *
 *   pn-delivery → pn-external-registries → pn-data-vault → pn-ss
 */

import { apigw } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { API_GW_LOG_GROUP, DEFAULT_MIN_STATUS_CODE, KNOWN_URLS, SERVICES } from './constants.js';
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
      description: 'Analizza gli allarmi API Gateway del microservizio pn-delivery (canale B2B)',
      version: '2.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['api-gateway', 'pn-delivery', 'pn-external-registries', 'pn-data-vault', 'pn-ss', 'selfcare'],
    },
    apiGwLogGroup: API_GW_LOG_GROUP,
    minStatusCode: DEFAULT_MIN_STATUS_CODE,
    services: SERVICES,
    knownUrls: KNOWN_URLS,
    knownCases: KNOWN_CASES,
  });
}
