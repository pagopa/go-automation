/**
 * Known URLs for the pn-delivery-IO_EXP-ApiGwAlarm runbook.
 *
 * A `target` matching a service in {@link REACHABLE_SERVICES} (or the
 * {@link ENTRY_SERVICE}) loops the analysis into that service; any other
 * target is treated as an external downstream and terminates the chain.
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
