/**
 * Downstream error patterns for the pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 */

import { type lambda, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';

/** Timeout of the backend of IO while the CIE or SPID keys are read. */
export const IDP_KEYS_TIMEOUT_PATTERN =
  'Errore nella chiamata idpKeys(?:CieGet|SpidTagGet):[\\s\\S]*Message:\\s*Timeout of 1000ms exceeded';

/** Failure of the backend of IO while the certificates of the identity providers are read. */
export const IDP_CERT_ERROR_PATTERN = 'IDP_CERT_DATA_RETRIEVING_ERROR';

export const DOWNSTREAM_ERROR_PATTERNS: ReadonlyArray<lambda.DownstreamErrorPattern> = [
  {
    pattern: IDP_KEYS_TIMEOUT_PATTERN,
    target: SEND_DOWNSTREAMS.APP_IO,
    description: 'Timeout durante il recupero delle chiavi CIE o SPID dal backend di IO.',
  },
  {
    pattern: IDP_CERT_ERROR_PATTERN,
    target: SEND_DOWNSTREAMS.APP_IO,
    description: 'Errore nel recupero dei certificati degli identity provider dal backend di IO.',
  },
];
