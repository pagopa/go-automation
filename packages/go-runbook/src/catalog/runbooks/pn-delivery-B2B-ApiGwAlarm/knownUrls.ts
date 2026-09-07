/**
 * Known URLs for the pn-delivery-B2B-ApiGwAlarm runbook.
 */
import type { apigw } from '../framework.js';

export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [
  {
    url: '^https?://[^/:]+(?::\\d+)?/ext-registry-private(?:/|$)',
    matchType: 'regex',
    target: 'pn-external-registries',
    description: 'Endpoint interno di pn-external-registries per gruppi e anagrafiche PA.',
  },
  {
    url: '^https?://[^/:]+(?::\\d+)?/f24-private(?:/|$)',
    matchType: 'regex',
    target: 'pn-f24',
    description: 'Endpoint interno di pn-f24 per la generazione degli allegati F24.',
  },
  {
    url: '^https?://[^/:]+(?::\\d+)?/(?:[^/]+/)?safe-storage/v1/files(?:/|$)',
    matchType: 'regex',
    target: 'pn-safestorage',
    description: 'Endpoint Safe Storage usato da pn-f24 per recuperare i metadati degli allegati.',
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
  {
    url: 'https://api.tokenizer.pdv.pagopa.it/tokenizer/',
    matchType: 'prefix',
    target: 'PersonalDataVault',
    description: 'Endpoint pubblico del tokenizer Personal Data Vault.',
  },
  {
    url: 'https://api.selfcare.pagopa.it/external/',
    matchType: 'prefix',
    target: 'Selfcare',
    description: 'Endpoint Selfcare invocato da pn-data-vault e pn-external-registries.',
  },
];
