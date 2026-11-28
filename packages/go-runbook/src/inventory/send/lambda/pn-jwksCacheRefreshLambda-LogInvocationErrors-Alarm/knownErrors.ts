/**
 * Known errors for the pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm runbook.
 */
import { knownError, lambda, lambdaLogEvidenceMatches } from '../../../../toolkits/send/index.js';
import type { KnownError } from '../../../../engine/index.js';
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  ...lambda.LAMBDA_RUNTIME_KNOWN_ERRORS,
  knownError({
    code: 'SEND_LAMBDA_PJCRLLIEA_JWK-INQ-TFD-SER-UNA',
    description: 'Download JWKS Inquery caftfdc_pagopa.it fallito con HTTP 503',
    condition: lambdaLogEvidenceMatches(
      'Error during addJwksCacheEntry.*caftfdc_pagopa\\.it.*iqpanel\\.inquery\\.it.*status:\\s*503.*Service Unavailable',
    ),
    title: 'JWKS cache refresh: Inquery caftfdc_pagopa.it non raggiungibile (HTTP 503)',
    resolution: 'Casuale irraggiungibilit\u00E0 del servizio ad ora rientrata.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_LAMBDA_PJCRLLIEA_JWK-UCI-BAD-GAT',
    description: 'Download JWKS gestione.sedi.uci.it fallito con HTTP 502',
    condition: lambdaLogEvidenceMatches(
      'Error during addJwksCacheEntry.*gestione\\.sedi\\.uci\\.it.*status:\\s*502.*Bad Gateway',
    ),
    title: 'JWKS cache refresh: gestione.sedi.uci.it ha risposto Bad Gateway (HTTP 502)',
    resolution:
      'Spesso \u00E8 un errore di rete temporaneo. Estendendo di qualche minuto l\u2019intervallo temporale di ricerca nei log sar\u00E0 possibile verificare l\u2019esito positivo dell\u2019operazione tramite retry.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_LAMBDA_PJCRLLIEA_JWK-RAD-ECO',
    description: 'Download JWKS sedi RADD fallito con read ECONNRESET',
    condition: lambdaLogEvidenceMatches('Error during addJwksCacheEntry.*AxiosError:\\s*read ECONNRESET'),
    title: 'JWKS cache refresh: errore di rete ECONNRESET su sede RADD',
    resolution:
      'Solitamente, estendendo l\u2019intervallo temporale di analisi dei log (@requestID differente) \u00E8 possibile verificare che la problematica viene risolta al retry successivo (5 min).',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_LAMBDA_PJCRLLIEA_JWK-CAF-URL-REW-ERR',
    description: 'Download JWKS cafconfagricoltura.it fallito con HTTP 500 URL Rewrite Module Error',
    condition: lambdaLogEvidenceMatches(
      'Error downloading URL:\\s*https://www\\.cafconfagricoltura\\.it/\\.well-known/jwks\\.json.*status:\\s*500.*URL Rewrite Module Error',
    ),
    title: 'JWKS cache refresh: cafconfagricoltura.it risponde HTTP 500 URL Rewrite Module Error',
    resolution: 'Thread Slack 23/04/2026',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_LAMBDA_PJCRLLIEA_JWK-INQ-INT-SER-ERR',
    description: 'Download JWKS Inquery fallito con HTTP 500 Internal Server Error',
    condition: lambdaLogEvidenceMatches(
      'Error downloading URL:\\s*https://iqpanel\\.inquery\\.it/\\.well-known/jwks\\.json.*status:\\s*500.*Internal Server Error',
    ),
    title: 'JWKS cache refresh: Inquery risponde HTTP 500 Internal Server Error',
    resolution: '11/05/2026: Aggiornamento del thread 23/04/2026',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
];
