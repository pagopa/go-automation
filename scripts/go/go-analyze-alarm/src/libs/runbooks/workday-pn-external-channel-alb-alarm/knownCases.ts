/**
 * Known cases for the workday-pn-external-channel-alb-alarm runbook.
 */

import type { KnownCase } from '@go-automation/go-runbook';

/**
 * Known cases evaluated against service log analysis.
 */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'duplicated-event-400-02',
    description: 'Richieste duplicate inviate dai recapitisti',
    priority: 100,
    condition: {
      type: 'and',
      conditions: [
        {
          type: 'contains',
          ref: 'steps.query-pn-external-channel',
          regex: 'sendPaperProgressStatusRequest syntax/semantic errors',
        },
        {
          type: 'contains',
          ref: 'steps.query-pn-external-channel',
          regex: "result code = '400\\.02'",
        },
        {
          type: 'contains',
          ref: 'steps.query-pn-external-channel',
          regex: 'ERR_CONS_DUPLICATED_EVENT',
        },
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] Richieste duplicate inviate dai recapitisti\n' +
        'Risoluzione: Chiusura - caso noto. Evento duplicato lato recapitista, scenario gia tracciato in SNDA-2371.\n' +
        'Servizio: pn-external-channel\n' +
        'Codice errore: 400.02\n' +
        'Errore: ERR_CONS_DUPLICATED_EVENT\n' +
        'Trace ID: {{vars.externalChannelTraceId}}\n',
    },
  },
  {
    id: 'duplicated-event-err-cons',
    description: 'Richieste duplicate inviate dai recapitisti',
    priority: 99,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-external-channel',
      regex: 'ERR_CONS_DUPLICATED_EVENT',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] Richieste duplicate inviate dai recapitisti\n' +
        'Risoluzione: Chiusura - caso noto. Evento duplicato lato recapitista, scenario gia tracciato in SNDA-2371.\n' +
        'Servizio: pn-external-channel\n' +
        'Errore: ERR_CONS_DUPLICATED_EVENT\n' +
        'Trace ID: {{vars.externalChannelTraceId}}\n',
    },
  },
];
