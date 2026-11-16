import { knownCase, lambdaLogEvidenceMatches } from '../../../../toolkits/send/index.js';
import type { KnownCase } from '../../../../engine/index.js';

/** Confluence v1, timeout row; Watchtower analysis of 20 October 2026. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'daily-export-timeout',
    description: 'Timeout di esecuzione della Lambda DailyExport DynamoDB',
    priority: 100,
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
