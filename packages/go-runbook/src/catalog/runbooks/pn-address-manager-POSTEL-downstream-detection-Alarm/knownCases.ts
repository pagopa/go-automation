import { varEquals } from '../common/varConditions.js';
/**
 * Known cases for the pn-address-manager-POSTEL-downstream-detection-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';

const ANALYSIS_COMPLETED_FINAL_ACTION =
  'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto';

/** POSTEL case resolved only after every impacted batch is observed in WORKED state. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'postel-all-batches-worked-after-retry',
    description: '[DOWNSTREAM POSTEL] Tutti i batch impattati sono stati recuperati dai retry',
    priority: 100,
    condition: all(
      stepEvidenceMatches('query-pn-address-manager', '\\[DOWNSTREAM\\] Service POSTEL returned errors='),
      varEquals('postelAllBatchesWorked', 'true'),
    ),
    title: '[DOWNSTREAM POSTEL] Batch recuperati dai retry',
    resolution:
      'Tutti i {{vars.postelImpactedBatchCount}} batch impattati hanno raggiunto lo stato WORKED tramite retry; nessuna azione operativa necessaria.',
    details: [
      ['Servizio', 'pn-address-manager'],
      ['Batch impattati', '{{vars.postelImpactedBatchCount}}'],
      ['Batch WORKED', '{{vars.postelWorkedBatchCount}}'],
      ['Batch ID', '{{vars.postelImpactedBatchIds}}'],
      ['Finestra di verifica fino a', '{{vars.postelRecoveryWindowEnd}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Errore temporaneo restituito da POSTEL durante la normalizzazione degli indirizzi; esito dei batch verificato dai log applicativi.',
      downstreams: [SEND_DOWNSTREAMS.CONSOLIDATORE_POSTALE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
];
