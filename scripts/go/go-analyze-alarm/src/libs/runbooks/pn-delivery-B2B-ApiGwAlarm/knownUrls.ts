/**
 * Known URLs for the pn-delivery-B2B-ApiGwAlarm runbook.
 */
import type { apigw } from '@go-automation/go-runbook';

export const KNOWN_URLS: ReadonlyArray<apigw.KnownUrl> = [
  {
    url: 'https://api.pdv.pagopa.it/',
    matchType: 'prefix',
    target: 'pn-data-vault',
    description: 'URL pubblico di pdv per la gestione degli utenti (user-registry).',
  },
  {
    url: 'http://alb.confidential.pn.internal:8080/datavault-private/',
    matchType: 'prefix',
    target: 'pn-data-vault',
    description: 'URL interno di pn-data-vault per la gestione dei destinatari (recipients).',
  },
];
