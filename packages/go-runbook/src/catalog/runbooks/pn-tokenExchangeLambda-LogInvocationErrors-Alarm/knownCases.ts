/**
 * Known cases for the pn-tokenExchangeLambda-LogInvocationErrors-Alarm runbook.
 *
 * Shared runtime cases (timeout / out-of-memory) are spread in from
 * `lambda.LAMBDA_RUNTIME_KNOWN_CASES`; the cases below are alarm-specific
 * (downstream pn-emd-integration), matched on the log rows.
 */

import { lambda } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  {
    id: 'emd-retrieval-id-size',
    description: '[DOWNSTREAM pn-emd-integration] retrievalId con dimensione non valida (HTTP 400)',
    priority: 90,
    condition: lambdaLogEvidenceMatches('size must be between 50 and 50'),
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM pn-emd-integration] retrievalId: size must be between 50 and 50 (HTTP 400)\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: TBD - vedi thread Slack del 20/04/2026.\n',
    },

    analysis: {
      resolution: 'TBD - vedi thread Slack del 20/04/2026.',
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
    },
  },
  {
    id: 'emd-get-retrieval-id-ko',
    description: '[DOWNSTREAM pn-emd-integration] impossibile individuare il retrievalId (HTTP 404)',
    priority: 89,
    condition: lambdaLogEvidenceMatches('Error in get retrievalId'),
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM pn-emd-integration] GenerateKoResponse: Error in get retrievalId (HTTP 404)\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: nessuna azione - il servizio non è ancora abilitato ([Service disabled]).\n',
    },

    analysis: {
      resolution: 'nessuna azione - il servizio non è ancora abilitato ([Service disabled]).',
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  },
  {
    id: 'emd-get-retrieval-payload-ko',
    description: '[DOWNSTREAM pn-emd-integration] errore nel recupero del retrieval payload (HTTP 404)',
    priority: 88,
    condition: lambdaLogEvidenceMatches('Error getting retrieval payload'),
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM pn-emd-integration] Ending process _tokenCheckTPP: Error getting retrieval payload (HTTP 404)\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: nessuna azione - servizio non ancora in funzione ([Service disabled]). Da confermare.\n',
    },

    analysis: {
      resolution: 'nessuna azione - servizio non ancora in funzione ([Service disabled]). Da confermare.',
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
    },
  },
];
