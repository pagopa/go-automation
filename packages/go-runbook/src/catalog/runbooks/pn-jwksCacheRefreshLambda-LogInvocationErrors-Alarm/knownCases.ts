/**
 * Known cases for the pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm runbook.
 */

import { lambda } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  knownCase({
    id: 'jwks-inquery-tfdc-service-unavailable',
    description: 'Download JWKS Inquery caftfdc_pagopa.it fallito con HTTP 503',
    priority: 90,
    condition: lambdaLogEvidenceMatches(
      'Error during addJwksCacheEntry.*caftfdc_pagopa\\.it.*iqpanel\\.inquery\\.it.*status:\\s*503.*Service Unavailable',
    ),
    title: 'JWKS cache refresh: Inquery caftfdc_pagopa.it non raggiungibile (HTTP 503)',
    resolution: 'casistica nota di irraggiungibilita temporanea del servizio. Verificare eventuale retry successivo.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
    },
  }),
  knownCase({
    id: 'jwks-uci-bad-gateway',
    description: 'Download JWKS gestione.sedi.uci.it fallito con HTTP 502',
    priority: 89,
    condition: lambdaLogEvidenceMatches(
      'Error during addJwksCacheEntry.*gestione\\.sedi\\.uci\\.it.*status:\\s*502.*Bad Gateway',
    ),
    title: 'JWKS cache refresh: gestione.sedi.uci.it ha risposto Bad Gateway (HTTP 502)',
    resolution:
      'spesso errore di rete temporaneo. Estendere di qualche minuto la finestra log e verificare il retry positivo.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
    },
  }),
  knownCase({
    id: 'jwks-radd-econnreset',
    description: 'Download JWKS sedi RADD fallito con read ECONNRESET',
    priority: 88,
    condition: lambdaLogEvidenceMatches('Error during addJwksCacheEntry.*AxiosError:\\s*read ECONNRESET'),
    title: 'JWKS cache refresh: errore di rete ECONNRESET su sede RADD',
    resolution:
      'solitamente il retry successivo risolve. Estendere la ricerca ai log successivi, anche con requestId differente.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
    },
  }),
  knownCase({
    id: 'jwks-cafconfagricoltura-url-rewrite-error',
    description: 'Download JWKS cafconfagricoltura.it fallito con HTTP 500 URL Rewrite Module Error',
    priority: 87,
    condition: lambdaLogEvidenceMatches(
      'Error downloading URL:\\s*https://www\\.cafconfagricoltura\\.it/\\.well-known/jwks\\.json.*status:\\s*500.*URL Rewrite Module Error',
    ),
    title: 'JWKS cache refresh: cafconfagricoltura.it risponde HTTP 500 URL Rewrite Module Error',
    resolution: 'caso gia discusso nel thread Slack del 23/04/2026.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  }),
  knownCase({
    id: 'jwks-inquery-internal-server-error',
    description: 'Download JWKS Inquery fallito con HTTP 500 Internal Server Error',
    priority: 86,
    condition: lambdaLogEvidenceMatches(
      'Error downloading URL:\\s*https://iqpanel\\.inquery\\.it/\\.well-known/jwks\\.json.*status:\\s*500.*Internal Server Error',
    ),
    title: 'JWKS cache refresh: Inquery risponde HTTP 500 Internal Server Error',
    resolution: "aggiornamento dell'11/05/2026 al thread Slack del 23/04/2026.",
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
    },
  }),
];
