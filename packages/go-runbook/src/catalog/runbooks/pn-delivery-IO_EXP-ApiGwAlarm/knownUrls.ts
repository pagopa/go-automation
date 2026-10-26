/**
 * Known URLs for the pn-delivery-IO_EXP-ApiGwAlarm runbook.
 */
import type { apigw } from '../framework.js';

export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [
  {
    url: '^https?://[^/:]+(?::\\d+)?/f24-private(?:/|$)',
    matchType: 'regex',
    target: 'pn-f24',
    description: 'Endpoint interno pn-f24.',
  },
  {
    url: '^https?://[^/:]+(?::\\d+)?/(?:[^/]+/)?safe-storage/v1/files(?:/|$)',
    matchType: 'regex',
    target: 'pn-safestorage',
    description: 'Endpoint Safe Storage per i metadati degli allegati.',
  },
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
