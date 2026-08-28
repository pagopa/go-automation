/**
 * Known cases for the pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm runbook.
 */

import { lambda } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'apikey-authorizer-timeout-single-occurrence',
    description: 'Timeout della Lambda authorizer pn-ApiKeyAuthorizerV2Lambda',
    priority: 110,
    condition: { type: 'compare', ref: 'vars.lambdaErrorCategory', operator: '==', value: 'timeout' },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] Timeout pn-ApiKeyAuthorizerV2Lambda\n' +
        'Duration: {{vars.lambdaDurationMs}} ms\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: solitamente occorrenza singola non anomala. Nessuna azione specifica richiesta.\n',
    },

    analysis: {
      resolution: 'solitamente occorrenza singola non anomala. Nessuna azione specifica richiesta.',
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  },
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  {
    id: 'apikey-authorizer-get-key-econnreset',
    description: 'Errore get key causato da interruzione connessione (ECONNRESET)',
    priority: 90,
    condition: lambdaLogEvidenceMatches('Error in get key[\\s\\S]*AxiosError:\\s*read ECONNRESET'),
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] pn-ApiKeyAuthorizerV2Lambda: Error in get key - AxiosError read ECONNRESET\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: brusca interruzione della connessione. Solitamente occorrenza singola non anomala, nessuna azione specifica richiesta.\n',
    },

    analysis: {
      resolution:
        'brusca interruzione della connessione. Solitamente occorrenza singola non anomala, nessuna azione specifica richiesta.',
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  },
];
