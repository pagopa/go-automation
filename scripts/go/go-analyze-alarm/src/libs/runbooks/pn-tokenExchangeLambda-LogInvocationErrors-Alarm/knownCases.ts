/**
 * Known cases for the pn-tokenExchangeLambda-LogInvocationErrors-Alarm runbook.
 *
 * Shared runtime cases (timeout / out-of-memory) are spread in from
 * `lambda.LAMBDA_RUNTIME_KNOWN_CASES`; the cases below are alarm-specific
 * (downstream pn-emd-integration), matched on the log rows.
 */

import { lambda } from '@go-automation/go-runbook';
import type { KnownCase } from '@go-automation/go-runbook';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  {
    id: 'emd-retrieval-id-size',
    description: '[DOWNSTREAM pn-emd-integration] retrievalId con dimensione non valida (HTTP 400)',
    priority: 90,
    condition: {
      type: 'or',
      conditions: [
        { type: 'contains', ref: 'steps.query-lambda-invocation', regex: 'size must be between 50 and 50' },
        { type: 'contains', ref: 'steps.query-lambda-errors', regex: 'size must be between 50 and 50' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM pn-emd-integration] retrievalId: size must be between 50 and 50 (HTTP 400)\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: TBD - vedi thread Slack del 20/04/2026.\n',
    },
  },
  {
    id: 'emd-get-retrieval-id-ko',
    description: '[DOWNSTREAM pn-emd-integration] impossibile individuare il retrievalId (HTTP 404)',
    priority: 89,
    condition: {
      type: 'or',
      conditions: [
        { type: 'contains', ref: 'steps.query-lambda-invocation', regex: 'Error in get retrievalId' },
        { type: 'contains', ref: 'steps.query-lambda-errors', regex: 'Error in get retrievalId' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM pn-emd-integration] GenerateKoResponse: Error in get retrievalId (HTTP 404)\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: nessuna azione - il servizio non è ancora abilitato ([Service disabled]).\n',
    },
  },
  {
    id: 'emd-get-retrieval-payload-ko',
    description: '[DOWNSTREAM pn-emd-integration] errore nel recupero del retrieval payload (HTTP 404)',
    priority: 88,
    condition: {
      type: 'or',
      conditions: [
        { type: 'contains', ref: 'steps.query-lambda-invocation', regex: 'Error getting retrieval payload' },
        { type: 'contains', ref: 'steps.query-lambda-errors', regex: 'Error getting retrieval payload' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM pn-emd-integration] Ending process _tokenCheckTPP: Error getting retrieval payload (HTTP 404)\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: nessuna azione - servizio non ancora in funzione ([Service disabled]). Da confermare.\n',
    },
  },
];
