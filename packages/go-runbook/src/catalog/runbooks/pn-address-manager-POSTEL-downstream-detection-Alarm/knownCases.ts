/**
 * Known cases for the pn-address-manager-POSTEL-downstream-detection-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import type { KnownCase } from '../framework.js';

const ANALYSIS_COMPLETED_FINAL_ACTION =
  'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto';

/** POSTEL case resolved only after every impacted batch is observed in WORKED state. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'postel-all-batches-worked-after-retry',
    description: '[DOWNSTREAM POSTEL] Tutti i batch impattati sono stati recuperati dai retry',
    priority: 100,
    condition: {
      type: 'and',
      conditions: [
        {
          type: 'contains',
          ref: 'steps.query-pn-address-manager',
          regex: '\\[DOWNSTREAM\\] Service POSTEL returned errors=',
        },
        { type: 'compare', ref: 'vars.postelAllBatchesWorked', operator: '==', value: 'true' },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM POSTEL] Batch recuperati dai retry\n' +
        'Risoluzione: tutti i batch impattati hanno raggiunto lo stato WORKED; nessuna azione operativa necessaria.\n' +
        'Servizio: pn-address-manager\n' +
        'Batch impattati: {{vars.postelImpactedBatchCount}}\n' +
        'Batch WORKED: {{vars.postelWorkedBatchCount}}\n' +
        'Batch ID: {{vars.postelImpactedBatchIds}}\n' +
        'Finestra di verifica fino a: {{vars.postelRecoveryWindowEnd}}\n',
    },
    analysis: {
      resolution:
        'Tutti i {{vars.postelImpactedBatchCount}} batch impattati hanno raggiunto lo stato WORKED tramite retry; ' +
        'nessuna azione operativa necessaria.',
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Errore temporaneo restituito da POSTEL durante la normalizzazione degli indirizzi; esito dei batch verificato dai log applicativi.',
      downstreams: [SEND_DOWNSTREAMS.CONSOLIDATORE_POSTALE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  },
];
