/**
 * Known cases for the pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm runbook.
 */

import { lambda } from '@go-automation/go-runbook';
import type { Condition, KnownCase } from '@go-automation/go-runbook';

function matchLambdaLog(regex: string): Condition {
  return {
    type: 'or',
    conditions: [
      { type: 'contains', ref: 'steps.query-lambda-invocation', regex },
      { type: 'contains', ref: 'steps.query-lambda-errors', regex },
    ],
  };
}

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  {
    id: 'jwks-inquery-tfdc-service-unavailable',
    description: 'Download JWKS Inquery caftfdc_pagopa.it fallito con HTTP 503',
    priority: 90,
    condition: matchLambdaLog(
      'Error during addJwksCacheEntry.*caftfdc_pagopa\\.it.*iqpanel\\.inquery\\.it.*status:\\s*503.*Service Unavailable',
    ),
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] JWKS cache refresh: Inquery caftfdc_pagopa.it non raggiungibile (HTTP 503)\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: casistica nota di irraggiungibilita temporanea del servizio. Verificare eventuale retry successivo.\n',
    },
  },
  {
    id: 'jwks-uci-bad-gateway',
    description: 'Download JWKS gestione.sedi.uci.it fallito con HTTP 502',
    priority: 89,
    condition: matchLambdaLog(
      'Error during addJwksCacheEntry.*gestione\\.sedi\\.uci\\.it.*status:\\s*502.*Bad Gateway',
    ),
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] JWKS cache refresh: gestione.sedi.uci.it ha risposto Bad Gateway (HTTP 502)\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: spesso errore di rete temporaneo. Estendere di qualche minuto la finestra log e verificare il retry positivo.\n',
    },
  },
  {
    id: 'jwks-radd-econnreset',
    description: 'Download JWKS sedi RADD fallito con read ECONNRESET',
    priority: 88,
    condition: matchLambdaLog('Error during addJwksCacheEntry.*AxiosError:\\s*read ECONNRESET'),
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] JWKS cache refresh: errore di rete ECONNRESET su sede RADD\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: solitamente il retry successivo risolve. Estendere la ricerca ai log successivi, anche con requestId differente.\n',
    },
  },
  {
    id: 'jwks-cafconfagricoltura-url-rewrite-error',
    description: 'Download JWKS cafconfagricoltura.it fallito con HTTP 500 URL Rewrite Module Error',
    priority: 87,
    condition: matchLambdaLog(
      'Error downloading URL:\\s*https://www\\.cafconfagricoltura\\.it/\\.well-known/jwks\\.json.*status:\\s*500.*URL Rewrite Module Error',
    ),
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] JWKS cache refresh: cafconfagricoltura.it risponde HTTP 500 URL Rewrite Module Error\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: caso gia discusso nel thread Slack del 23/04/2026.\n',
    },
  },
  {
    id: 'jwks-inquery-internal-server-error',
    description: 'Download JWKS Inquery fallito con HTTP 500 Internal Server Error',
    priority: 86,
    condition: matchLambdaLog(
      'Error downloading URL:\\s*https://iqpanel\\.inquery\\.it/\\.well-known/jwks\\.json.*status:\\s*500.*Internal Server Error',
    ),
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] JWKS cache refresh: Inquery risponde HTTP 500 Internal Server Error\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        "Risoluzione: aggiornamento dell'11/05/2026 al thread Slack del 23/04/2026.\n",
    },
  },
];
