/**
 * Runbook: pn-national-registries-PNPG-ApiGwAlarm
 */

import { apigw } from '../framework.js';
import type { Runbook } from '../framework.js';

import { API_GW_LOG_GROUP, ENTRY_SERVICE, REACHABLE_SERVICES } from './knownServices.js';
import { KNOWN_URLS } from './knownUrls.js';
import { KNOWN_CASES } from './knownCases.js';

/**
 * Builds the pn-national-registries-PNPG-ApiGwAlarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return apigw.createApiGwAlarmRunbook({
    id: 'pn-national-registries-PNPG-ApiGwAlarm',
    metadata: {
      name: 'pn-national-registries-PNPG-ApiGwAlarm',
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
    hooks: [
      {
        at: 'before-service-traversal',
        silent: true,
        evidence: [
          {
            id: 'national-registries-completion',
            label: 'Avvio e completamento applicativo legal-institutions per trace',
            type: 'log-sample',
            retention: { mode: 'all' },
          },
        ],
        step: new apigw.QueryServiceLogsStep({
          id: 'query-national-registries-completion',
          label: 'Verifica completamento applicativo legal-institutions per trace',
          serviceName: ENTRY_SERVICE.name,
          entryService: true,
          logGroups: [ENTRY_SERVICE.logGroup],
          timeRangeFromParams: { start: 'startTime', end: 'endTime' },
          queryTemplateOverride:
            '{{FILTER_CLAUSE}}\n' +
            '| filter message = "Starting process _infoCamereLegalInstitutions" ' +
            'or message = "Ending process _infoCamereLegalInstitutions" ' +
            'or message = "Checking [INFO CAMERE] legal institutions passed"\n' +
            '| sort @timestamp asc\n| limit 1000\n| display @timestamp, level, message, trace_id',
        }),
      },
    ],
    knownUrls: KNOWN_URLS,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: 'pn-national-registries-PNPG-ApiGwAlarm',
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2111700993/pn-national-registries-PNPG-ApiGwAlarm',
          name: 'pn-national-registries-PNPG-ApiGwAlarm',
          type: 'CONFLUENCE',
        },
      ],
    },
  });
}
