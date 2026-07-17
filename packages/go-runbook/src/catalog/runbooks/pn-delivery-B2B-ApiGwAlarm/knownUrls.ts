/**
 * Known URLs for the pn-delivery-B2B-ApiGwAlarm runbook.
 */
import type { apigw } from '../framework.js';

export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [
  {
    url: 'https://api.pdv.pagopa.it/',
    matchType: 'prefix',
    target: 'pn-data-vault',
    description: 'URL pubblico di pdv per la gestione degli utenti (user-registry).',
  },
  {
    url: '^https?://[^/:]+(?::\\d+)?/datavault-private(?:/|$)',
    matchType: 'regex',
    target: 'pn-data-vault',
    description: 'Endpoint interno di pn-data-vault per la gestione dei destinatari (recipients).',
  },
];
