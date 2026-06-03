/**
 * Known URLs for the pn-delivery-push-B2B-ApiGwAlarm runbook.
 */
import type { apigw } from '@go-automation/go-runbook';

export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [
  {
    url: '^https?://[^/:]+(?::\\d+)?/(?:[^/]+/)?safe-storage/v1/files(?:/|$)',
    matchType: 'regex',
    target: 'pn-safestorage',
    description: 'Endpoint SafeStorage per download/metadati dei file richiesti da pn-delivery-push.',
  },
  {
    url: '^https?://[^/:]+(?::\\d+)?/datavault-private(?:/|$)',
    matchType: 'regex',
    target: 'pn-data-vault',
    description: 'Endpoint interno di pn-data-vault osservabile nel flusso delivery-push.',
  },
  {
    url: 'https://api.pdv.pagopa.it/',
    matchType: 'prefix',
    target: 'pn-data-vault',
    description: 'URL pubblico PDV per la risoluzione dei dati destinatario.',
  },
  {
    url: 'https://api.selfcare.pagopa.it/external/',
    matchType: 'prefix',
    target: 'Selfcare',
    description: 'Endpoint Selfcare invocato da pn-data-vault.',
  },
];
