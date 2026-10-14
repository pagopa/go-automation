import type { apigw } from '../framework.js';

export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [
  {
    url: '^https?://[^/:]+(?::\\d+)?/ext-registry(?:-private)?(?:/|$)',
    matchType: 'regex',
    target: 'pn-external-registries',
    description: 'Endpoint interni di pn-external-registries per istituzioni, prodotti e gruppi PA.',
  },
  {
    url: 'https://api.selfcare.pagopa.it/external/',
    matchType: 'prefix',
    target: 'Selfcare',
    description: 'API Selfcare invocate da pn-external-registries.',
  },
];
