import { varEquals } from '../common/varConditions.js';
/**
 * Known cases for the pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm runbook.
 */

import { lambda } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'apikey-authorizer-timeout-single-occurrence',
    description: 'Timeout della Lambda authorizer pn-ApiKeyAuthorizerV2Lambda',
    priority: 110,
    condition: varEquals('lambdaErrorCategory', 'timeout'),
    title: 'Timeout pn-ApiKeyAuthorizerV2Lambda',
    resolution: 'solitamente occorrenza singola non anomala. Nessuna azione specifica richiesta.',
    details: [
      ['Duration', '{{vars.lambdaDurationMs}} ms'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  knownCase({
    id: 'apikey-authorizer-get-key-econnreset',
    description: 'Errore get key causato da interruzione connessione (ECONNRESET)',
    priority: 90,
    condition: lambdaLogEvidenceMatches('Error in get key[\\s\\S]*AxiosError:\\s*read ECONNRESET'),
    title: 'pn-ApiKeyAuthorizerV2Lambda: Error in get key - AxiosError read ECONNRESET',
    resolution:
      'brusca interruzione della connessione. Solitamente occorrenza singola non anomala, nessuna azione specifica richiesta.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  }),
];
