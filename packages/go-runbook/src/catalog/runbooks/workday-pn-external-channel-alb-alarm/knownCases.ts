/**
 * Known cases for the workday-pn-external-channel-alb-alarm runbook.
 */

import type { KnownCase } from '../framework.js';
import { knownCase } from '../framework.js';

/**
 * Known cases evaluated against service log analysis.
 */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
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
    resolution: 'Chiusura - caso noto. Evento duplicato lato recapitista, scenario gia tracciato in SNDA-2371.',
    details: [
      ['Servizio', 'pn-external-channel'],
      ['Codice errore', '400.02'],
      ['Errore', 'ERR_CONS_DUPLICATED_EVENT'],
      ['Trace ID', '{{vars.externalChannelTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  }),
  knownCase({
    id: 'duplicated-event-err-cons',
    description: 'Richieste duplicate inviate dai recapitisti',
    priority: 99,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-external-channel',
      regex: 'ERR_CONS_DUPLICATED_EVENT',
    },
    resolution: 'Chiusura - caso noto. Evento duplicato lato recapitista, scenario gia tracciato in SNDA-2371.',
    details: [
      ['Servizio', 'pn-external-channel'],
      ['Errore', 'ERR_CONS_DUPLICATED_EVENT'],
      ['Trace ID', '{{vars.externalChannelTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
    },
  }),
];
