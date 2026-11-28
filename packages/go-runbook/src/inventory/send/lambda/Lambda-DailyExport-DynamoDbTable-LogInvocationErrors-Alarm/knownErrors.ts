import { knownError, lambdaLogEvidenceMatches } from '../../../../toolkits/send/index.js';
import type { KnownError } from '../../../../engine/index.js';

/** Confluence v1, timeout row; Watchtower analysis of 20 October 2026. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_LAMBDA_LDEDDTLIEA_DAI-EXP-TIM',
    description: 'Timeout di esecuzione della Lambda DailyExport DynamoDB',
    condition: lambdaLogEvidenceMatches('Status: *timeout'),
    title: 'Timeout Lambda {{vars.lambdaFunctionName}}',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Errore', '{{vars.lambdaErrorMessage}}'],
      ['requestId', '{{vars.lambdaRequestId}}'],
    ],
    analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE' },
  }),
];
