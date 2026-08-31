/**
 * Downstream error patterns for the pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import type { lambda } from '../framework.js';

export const DOWNSTREAM_ERROR_PATTERNS: ReadonlyArray<lambda.DownstreamErrorPattern> = [
  {
    pattern: 'Errore nella chiamata idpKeys(?:CieGet|SpidTagGet):[\\s\\S]*Message:\\s*Timeout of 1000ms exceeded',
    target: SEND_DOWNSTREAMS.APP_IO,
    description: 'Timeout durante il recupero delle chiavi CIE o SPID dal backend di IO.',
  },
  {
    pattern: 'IDP_CERT_DATA_RETRIEVING_ERROR',
    target: SEND_DOWNSTREAMS.APP_IO,
    description: 'Errore nel recupero dei certificati degli identity provider dal backend di IO.',
  },
];
