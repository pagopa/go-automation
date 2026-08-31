/**
 * Runbook: pn-address-manager-POSTEL-downstream-detection-Alarm
 */

import { service } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { SERVICE } from './knownServices.js';
import { VerifyPostelBatchesStep } from './VerifyPostelBatchesStep.js';

/** Builds the pn-address-manager POSTEL downstream-detection runbook. */
export function buildAddressManagerPostelDownstreamDetectionAlarmRunbook(): Runbook {
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
    preSteps: [
      {
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
    fallbackAction: {
      type: 'log',
      level: 'warn',
      renderAs: 'unknown-case',
      message:
        '[CASO NON RICONOSCIUTO]\n' +
        'Esito: recupero dei batch POSTEL non ancora dimostrato.\n' +
        'Dettaglio: proseguire la verifica dei batch mancanti e del downstream Consolidatore postale.\n' +
        'Servizio: pn-address-manager\n' +
        'Batch impattati: {{vars.postelImpactedBatchCount}}\n' +
        'Batch WORKED: {{vars.postelWorkedBatchCount}}\n' +
        'Batch non verificati: {{vars.postelPendingBatchCount}}\n' +
        'Batch ID non verificati: {{vars.postelPendingBatchIds}}\n' +
        'Finestra di recupero: {{vars.postelRecoveryAfterMinutes}} minuti\n' +
        'Errore: {{vars.addressManagerErrorMsg}}\n',
    },
  });
}
