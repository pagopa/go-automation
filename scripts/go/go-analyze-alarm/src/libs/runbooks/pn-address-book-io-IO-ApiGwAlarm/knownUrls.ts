/**
 * Known URLs for the pn-address-book-io-IO-ApiGwAlarm runbook.
 */
import type { apigw } from '@go-automation/go-runbook';

export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [
  {
    url: 'https://api.io.pagopa.it/api/v1/activations/',
    matchType: 'prefix',
    target: 'AppIO',
    description: 'Endpoint AppIO osservato nei log di pn-external-registries.',
  },
  {
    url: '^https?://[^/:]+(?::\\d+)?/ext-registry-private/io/v1/activations(?:/|$)',
    matchType: 'regex',
    target: 'pn-external-registries',
    description: 'Endpoint interno verso ext-registry-private/io/v1/activations.',
  },
];
