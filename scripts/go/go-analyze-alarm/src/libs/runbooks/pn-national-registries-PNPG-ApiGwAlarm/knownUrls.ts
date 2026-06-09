/**
 * Known URLs for the pn-national-registries-PNPG-ApiGwAlarm runbook.
 */

import type { apigw } from '@go-automation/go-runbook';

/**
 * Known URLs used to enrich the trace and drive the analysis loop.
 */
export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [
  {
    url: 'https://gatewaywebservices.agenziaentrate.it/',
    matchType: 'prefix',
    target: 'AdE',
    description: 'Endpoint Agenzia Entrate invocati da pn-national-registries.',
  },
  {
    url: 'https://icapis.infocamere.it/',
    matchType: 'prefix',
    target: 'InfoCamere',
    description: 'Endpoint InfoCamere invocati da pn-national-registries.',
  },
];
