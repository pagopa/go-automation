import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';
import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';

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
