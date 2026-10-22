/**
 * Known cases for the workday-pn-external-channel-alb-alarm runbook.
 */
import type { KnownCase } from '../framework.js';
import { knownCase } from '../framework.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
/**
 * Known cases evaluated against service log analysis.
 */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'duplicated-event-400-02',
    description: 'Richieste duplicate inviate dai recapitisti',
    priority: 100,
    condition: all(
      stepEvidenceMatches('query-pn-external-channel', 'sendPaperProgressStatusRequest syntax/semantic errors'),
      stepEvidenceMatches('query-pn-external-channel', "result code = '400\\.02'"),
      stepEvidenceMatches('query-pn-external-channel', 'ERR_CONS_DUPLICATED_EVENT'),
    ),
    resolution:
      "[SNDA-2371] analisi su grande numero di eventi di recapito duplicati nella notte tra l'11/05 e il 12/05 - Jira",
    details: [
      ['Servizio', 'pn-external-channel'],
      ['Codice errore', '400.02'],
      ['Errore', 'ERR_CONS_DUPLICATED_EVENT'],
      ['Trace ID', '{{vars.externalChannelTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'duplicated-event-err-cons',
    description: 'Richieste duplicate inviate dai recapitisti',
    priority: 99,
    condition: stepEvidenceMatches('query-pn-external-channel', 'ERR_CONS_DUPLICATED_EVENT'),
    resolution:
      "[SNDA-2371] analisi su grande numero di eventi di recapito duplicati nella notte tra l'11/05 e il 12/05 - Jira",
    details: [
      ['Servizio', 'pn-external-channel'],
      ['Errore', 'ERR_CONS_DUPLICATED_EVENT'],
      ['Trace ID', '{{vars.externalChannelTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [],
    },
  }),
];
