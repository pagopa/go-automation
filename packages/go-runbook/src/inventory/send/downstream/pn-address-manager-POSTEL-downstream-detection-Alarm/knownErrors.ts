import { all, type KnownError, stepEvidenceMatches, varEquals } from '../../../../engine/index.js';
import { downstreamMarkerPattern, knownError, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';
/**
 * Known errors for the pn-address-manager-POSTEL-downstream-detection-Alarm runbook.
 */
/** POSTEL case resolved only after every impacted batch is observed in WORKED state. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  knownError({
    code: 'SEND_DOWNSTREAM_PAMPOSTELDDA_POS-ALL-BAT-WOR-AFT-RET',
    description: '[DOWNSTREAM POSTEL] Tutti i batch impattati sono stati recuperati dai retry',
    condition: all(
      stepEvidenceMatches('query-pn-address-manager', downstreamMarkerPattern('POSTEL')),
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
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Errore temporaneo restituito da POSTEL durante la normalizzazione degli indirizzi; esito dei batch verificato dai log applicativi.',
      downstreams: [SEND_DOWNSTREAMS.CONSOLIDATORE_POSTALE],
      finalActions: [],
      links: [],
    },
  }),
];
