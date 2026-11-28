import { service, unknownErrorFallback } from '../../../../toolkits/send/index.js';
import type { Runbook } from '../../../../engine/index.js';

import { DELAYER_RESIDUAL_CAPACITY_ALARM } from './alarmDefinition.js';
import { KNOWN_ERRORS } from './knownErrors.js';
import { SERVICE } from './knownServices.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/2137686420/pn-delayer-residual-capacity-ErrorFatalLogs-Alarm';

/**
 * Builds the pn-delayer-residual-capacity-ErrorFatalLogs-Alarm runbook definition.
 *
 * @returns A validated {@link Runbook} ready for execution
 */
export function buildRunbook(): Runbook {
  return service.createSendServiceAlarmRunbook({
    id: DELAYER_RESIDUAL_CAPACITY_ALARM,
    metadata: {
      name: DELAYER_RESIDUAL_CAPACITY_ALARM,
      description: 'Analizza gli errori del job pn-delayer residual capacity e riconosce le capacità driver mancanti.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-delayer', 'residual-capacity', 'batch-job'],
    },
    service: SERVICE,
    knownErrors: KNOWN_ERRORS,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },
    analysisDefaults: {
      runbookName: DELAYER_RESIDUAL_CAPACITY_ALARM,
      links: [{ url: RUNBOOK_URL, name: DELAYER_RESIDUAL_CAPACITY_ALARM, type: 'CONFLUENCE' }],
    },
    fallbackAction: unknownErrorFallback('Errore pn-delayer non censito nella tabella dei casi noti', [
      ['Servizio', 'pn-delayer'],
      ['Job', 'pn-delayer-residual-capacity-job'],
      ['Errore', '{{vars.delayerResidualCapacityJobErrorMsg}}'],
      ['Trace ID', '{{vars.delayerResidualCapacityJobTraceId}}'],
      [
        'Azione',
        'Aggiornare la tabella Casi noti con il nuovo errore e il runbook con le modifiche che hanno portato alla soluzione; proseguire sul microservizio indicato dal log, se necessario.',
      ],
    ]),
  });
}
