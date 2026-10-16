import type { apigw } from '../framework.js';

export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [
  {
    url: '^https?://[^/:]*pn-external-registries-checkout[^/:]*(?::\\d+)?/',
    matchType: 'regex',
    target: 'pn-external-registries-checkout',
    description: 'Host esplicito del servizio checkout osservato nel trace.',
  },
  {
    url: '^https?://[^/:]+(?::\\d+)?/ext-registry(?:-private)?(?:/|$)',
    matchType: 'regex',
    target: 'pn-external-registries',
    description: 'API interne pn-external-registries.',
  },
  {
    url: '^https?://[^/:]+(?::\\d+)?/delivery(?:-private)?(?:/|$)',
    matchType: 'regex',
    target: 'pn-delivery',
    description: 'API interne pn-delivery.',
  },
  {
    url: '^https?://[^/:]+(?::\\d+)?/datavault-private(?:/|$)',
    matchType: 'regex',
    target: 'pn-data-vault',
    description: 'API interne Personal Data Vault.',
  },
  {
    url: 'https://api.platform.pagopa.it/ecommerce/',
    matchType: 'prefix',
    target: 'Checkout pagoPA',
    description: 'API esterna Checkout pagoPA.',
  },
];
