import { RunbookBuilder } from '../../../builders/RunbookBuilder.js';
import { unknownCaseFallback } from '../../../actions/unknownCaseFallback.js';
import { knownCase } from '../framework.js';
import type { Runbook } from '../framework.js';
import { varEquals } from '../common/varConditions.js';

import { LOGSAVER_ALARM, RUNBOOK_URL } from './alarmDefinition.js';
import { QueryLogsaverDiagnosticsStep } from './QueryLogsaverDiagnosticsStep.js';

export function buildRunbook(): Runbook {
  return RunbookBuilder.create(LOGSAVER_ALARM)
    .metadata({
      name: LOGSAVER_ALARM,
      description: 'Raccoglie i log del job logsaver e prepara la verifica del fallimento e del recupero in AWS Batch.',
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
        description: 'Log raccolti: causa del fallimento Batch e recupero ancora da verificare',
        priority: 100,
        condition: varEquals('logsaverDiagnostics', 'COLLECTED'),
        level: 'warn',
        resolution:
          'Nell’account dell’occorrenza aprire AWS Batch, coda pn-logsaver-be-job-queue. ' +
          'Identificare tutti i job FAILED correlati per job ID e orario di fine, verificando anche la job definition. ' +
          'Controllare Status reason, Job attempts, motivo del container, exit code e strategia di retry effettiva; ' +
          'aprire il log stream di ciascun tentativo e ampliare la finestra all’intera esecuzione. ' +
          'Your Spot Task was interrupted. indica un’interruzione del task Fargate Spot solo se confermata nel job. ' +
          'Non dedurre questa causa da log vuoti e non assumere retry automatici. ' +
          'Verificare che un’elaborazione successiva abbia recuperato gli stessi dati e intervalli del job fallito: ' +
          'il solo stato SUCCEEDED di un altro job non basta. Mantenere l’analisi aperta finché il recupero non è documentato; ' +
          'se mancano evidenze, il fallimento si ripete o vi è rischio di perdita dei log, coinvolgere Infra e l’owner di pn-logsaver. ' +
          'Per job storici non più consultabili usare le evidenze dell’evento e dell’analisi, dichiarando il limite. ' +
          'Non rilanciare o modificare job durante questa verifica.',
        details: [
          ['Account verificati', '{{vars.logsaverAccountsChecked}}'],
          ['Log di errore', '{{vars.logsaverErrorLogCount}}'],
          ['Stream osservati', '{{vars.logsaverStreamCount}}'],
          ['Verifica Batch', 'Da completare nell’account dell’occorrenza'],
        ],
        analysis: { proposedStatus: 'IN_PROGRESS', analysisType: 'ANALYZABLE' },
      }),
    )
    .fallback(
      unknownCaseFallback('Evidenze insufficienti sul fallimento del job logsaver', [
        [
          'Azione',
          'Verificare account, regione, intervallo e accesso ai log; proseguire con la verifica del job Batch.',
        ],
      ]),
    )
    .build();
}
