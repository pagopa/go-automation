/**
 * Runbook: pn-national-registries-PNPG-ApiGwAlarm
 */

import { apigw } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-national-registries-PNPG-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildNationalRegistriesPNPGApiGwAlarmRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-national-registries-PNPG-ApiGwAlarm',
    metadata: {
      name: 'ANALISI ALLARME pn-national-registries-PNPG-ApiGwAlarm',
      description:
        'Gestire in modo standardizzato gli allarmi generati da Api Gateway quando si verificano errori sul microservizio pn-national-registries.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['api-gateway', 'pn-national-registries', 'AdE', 'InfoCamere'],
    },
    apiGwLogGroup: API_GW_LOG_GROUP,
    minStatusCode: 400,
    entryService: ENTRY_SERVICE,
    services: REACHABLE_SERVICES,
    knownUrls: KNOWN_URLS,
    knownCases: KNOWN_CASES,
  });
}
