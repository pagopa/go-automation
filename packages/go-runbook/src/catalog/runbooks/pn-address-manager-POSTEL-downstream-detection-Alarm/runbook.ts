/**
 * Runbook: pn-address-manager-POSTEL-downstream-detection-Alarm
 */

import { unknownCaseFallback } from '../../../actions/unknownCaseFallback.js';
import { service } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { SERVICE } from './knownServices.js';
import { VerifyPostelBatchesStep } from './VerifyPostelBatchesStep.js';

/** Builds the pn-address-manager POSTEL downstream-detection runbook. */
export function buildRunbook(): Runbook {
  return service.createServiceAlarmRunbook({
    id: 'pn-address-manager-POSTEL-downstream-detection-Alarm',
    metadata: {
      name: 'pn-address-manager-POSTEL-downstream-detection-Alarm',
      description:
        'Gestire gli allarmi generati dagli errori POSTEL e verificare il recupero di tutti i batch di normalizzazione impattati.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-address-manager', 'downstream', 'POSTEL', 'batch-retry'],
    },
    service: SERVICE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: {
      beforeMinutes: 10,
      afterMinutes: 5,
    },
    hooks: [
      {
        at: 'after-service-analysis',
        step: new VerifyPostelBatchesStep({
          id: 'verify-postel-batches',
          label: 'Verifica recupero batch POSTEL',
          fromStep: 'query-pn-address-manager',
          logGroup: SERVICE.logGroup,
        }),
        continueOnFailure: true,
        silent: true,
      },
    ],
    fallbackAction: unknownCaseFallback('Recupero dei batch POSTEL non ancora dimostrato.', [
      ['Dettaglio', 'proseguire la verifica dei batch mancanti e del downstream Consolidatore postale.'],
      ['Servizio', 'pn-address-manager'],
      ['Batch impattati', '{{vars.postelImpactedBatchCount}}'],
      ['Batch WORKED', '{{vars.postelWorkedBatchCount}}'],
      ['Batch non verificati', '{{vars.postelPendingBatchCount}}'],
      ['Batch ID non verificati', '{{vars.postelPendingBatchIds}}'],
      ['Finestra di recupero', '{{vars.postelRecoveryAfterMinutes}} minuti'],
      ['Errore', '{{vars.addressManagerErrorMsg}}'],
    ]),
  });
}
