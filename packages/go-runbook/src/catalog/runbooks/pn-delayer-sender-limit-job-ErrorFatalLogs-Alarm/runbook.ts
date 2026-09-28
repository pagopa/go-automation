import { unknownCaseFallback } from '../../../actions/unknownCaseFallback.js';
import { service } from '../framework.js';
import type { Runbook } from '../framework.js';

import { DELAYER_SENDER_LIMIT_JOB_ALARM } from './alarmDefinition.js';
import { ClassifyDelayerAlarmDayStep } from './ClassifyDelayerAlarmDayStep.js';
import { KNOWN_CASES } from './knownCases.js';
import { SERVICE } from './knownServices.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3351480214/pn-delayer-sender-limit-job-ErrorFatalLogs-Alarm';

export function buildRunbook(): Runbook {
  return service.createServiceAlarmRunbook({
    id: DELAYER_SENDER_LIMIT_JOB_ALARM,
    metadata: {
      name: DELAYER_SENDER_LIMIT_JOB_ALARM,
      description: 'Analizza gli errori del job pn-delayer sender limit e applica la procedura del caso noto.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service', 'pn-delayer', 'sender-limit', 'batch-job'],
    },
    service: SERVICE,
    knownCases: KNOWN_CASES,
    hooks: [{ at: 'after-service-analysis', step: new ClassifyDelayerAlarmDayStep(), silent: true }],
    analysisDefaults: {
      runbookName: DELAYER_SENDER_LIMIT_JOB_ALARM,
      links: [{ url: RUNBOOK_URL, name: DELAYER_SENDER_LIMIT_JOB_ALARM, type: 'CONFLUENCE' }],
    },
    fallbackAction: unknownCaseFallback('Errore pn-delayer non censito nella tabella dei casi noti', [
      ['Servizio', 'pn-delayer'],
      ['Job', 'pn-delayer-sender-limit-job'],
      ['Errore', '{{vars.delayerSenderLimitJobErrorMsg}}'],
      ['Trace ID', '{{vars.delayerSenderLimitJobTraceId}}'],
      [
        'Azione',
        'Analizzare il nuovo errore, aggiornare la tabella Casi noti e il runbook; proseguire sul microservizio indicato dal log, se necessario.',
      ],
    ]),
  });
}
