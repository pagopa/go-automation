import { RunbookBuilder } from '../../../builders/RunbookBuilder.js';
import { unknownCaseFallback } from '../../../actions/unknownCaseFallback.js';
import { knownCase } from '../framework.js';
import type { Runbook } from '../framework.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { LOGSAVER_ALARM, RUNBOOK_URL } from './alarmDefinition.js';
import { QueryLogsaverDiagnosticsStep } from './QueryLogsaverDiagnosticsStep.js';
export function buildRunbook(): Runbook {
  return RunbookBuilder.create(LOGSAVER_ALARM)
    .metadata({
      name: LOGSAVER_ALARM,
      description: 'Raccoglie i log del job logsaver e riconosce l’interruzione del task Fargate Spot.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-logsaver-be', 'batch', 'fargate-spot'],
    })
    .cloudExecutionPolicy({ sideEffects: 'NONE' })
    .occurrenceTimeWindow({ beforeMinutes: 60, afterMinutes: 5 })
    .analysisDefaults({
      runbookName: LOGSAVER_ALARM,
      resources: [{ name: 'pn-logsaver-be', type: 'Service', role: 'PRIMARY' }],
      links: [{ url: RUNBOOK_URL, name: LOGSAVER_ALARM, type: 'CONFLUENCE' }],
    })
    .step(new QueryLogsaverDiagnosticsStep(), { silent: true })
    .knownCase(
      knownCase({
        id: 'logsaver-batch-verification-required',
        description: 'Interruzione del task Fargate Spot',
        priority: 100,
        condition: stepEvidenceMatches('query-logsaver-diagnostics', 'Your Spot Task was interrupted\\.'),
        level: 'warn',
        resolution: 'Nessuna azione necessaria',
        details: [
          ['Account verificati', '{{vars.logsaverAccountsChecked}}'],
          ['Log di errore', '{{vars.logsaverErrorLogCount}}'],
          ['Stream osservati', '{{vars.logsaverStreamCount}}'],
        ],
        analysis: { proposedStatus: 'COMPLETED', analysisType: 'ANALYZABLE', finalActions: [], links: [] },
      }),
    )
    .fallback(
      unknownCaseFallback('Evidenze insufficienti sul fallimento del job logsaver', [
        ['Risoluzione', 'Risoluzione non documentata.'],
      ]),
    )
    .build();
}
