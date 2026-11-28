import { type KnownError, varEquals } from '../../../../engine/index.js';
import { knownError, lambda, lambdaLogEvidenceMatches } from '../../../../toolkits/send/index.js';
import { GET_KEY_ECONNRESET_PATTERN } from './downstreamErrorPatterns.js';
/**
 * Known errors for the pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm runbook.
 */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_LAMBDA_PAKAV2LIEA_API-AUT-TIM-SIN-OCC',
    description: 'Timeout della Lambda authorizer pn-ApiKeyAuthorizerV2Lambda',
    supersedes: ['SEND_LAMBDA_COMMON_LAM-TIM'],
    condition: varEquals('lambdaErrorCategory', 'timeout'),
    title: 'Timeout pn-ApiKeyAuthorizerV2Lambda',
    resolution: 'Il runbook descrive occorrenze singole per le quali non \u00E8 richiesta un\u2019azione specifica.',
    details: [
      ['Duration', '{{vars.lambdaDurationMs}} ms'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_ERRORS,
  knownError({
    code: 'SEND_LAMBDA_PAKAV2LIEA_API-AUT-GET-KEY-ECO',
    description: 'Errore get key causato da interruzione connessione (ECONNRESET)',
    condition: lambdaLogEvidenceMatches(GET_KEY_ECONNRESET_PATTERN),
    title: 'pn-ApiKeyAuthorizerV2Lambda: Error in get key - AxiosError read ECONNRESET',
    resolution: 'Il runbook descrive occorrenze singole per le quali non \u00E8 richiesta un\u2019azione specifica.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
];
