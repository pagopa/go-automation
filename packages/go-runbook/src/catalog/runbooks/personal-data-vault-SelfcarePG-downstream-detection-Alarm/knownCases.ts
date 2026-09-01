import { varEquals } from '../common/varConditions.js';
/**
 * Known cases for the personal-data-vault-SelfcarePG-downstream-detection-Alarm runbook.
 */

import type { KnownCase } from '../framework.js';
import { knownCase } from '../framework.js';
import { SEND_DOWNSTREAMS } from '../framework.js';

import { slackLink } from '../common/analysisLinks.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';

const SELFCARE_INCIDENT_URL = 'https://pagopaspa.slack.com/archives/C0585442Z39/p1774447095884019';
const ANALYSIS_COMPLETED_FINAL_ACTION =
  'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto';
const SELFCARE_RECOVERY_RESOLUTION =
  'Monitorare il downstream SelfCare e attenderne il ripristino; non sono disponibili azioni operative sul servizio esterno.';

/** Known SelfcarePG failures evaluated against the pn-data-vault SEP log group. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'selfcarepg-read-timeout-with-empty-error',
    description: '[DOWNSTREAM SelfcarePG] Timeout di lettura con dettaglio errore vuoto',
    priority: 110,
    condition: all(
      varEquals('dataVaultErrorMsg', '[DOWNSTREAM] Service SelfcarePG returned errors='),
      stepEvidenceMatches('query-pn-data-vault-trace', 'io\\.netty\\.handler\\.timeout\\.ReadTimeoutException'),
    ),
    title: '[DOWNSTREAM SelfcarePG] Timeout di lettura',
    resolution: SELFCARE_RECOVERY_RESOLUTION,
    details: [
      ['Servizio', 'pn-data-vault'],
      ['Endpoint', 'api.selfcare.pagopa.it:443'],
      ['Errore', '{{vars.dataVaultErrorMsg}}'],
      ['Trace ID', '{{vars.dataVaultTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'ReadTimeoutException verso api.selfcare.pagopa.it:443, correlata tramite X-Ray perché il log downstream non contiene il dettaglio dell’eccezione.',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
    },
  }),
  knownCase({
    id: 'selfcarepg-subject-alternative-name-mismatch',
    description: '[DOWNSTREAM SelfcarePG] Certificato non valido per api.selfcare.pagopa.it',
    priority: 100,
    condition: stepEvidenceMatches(
      'query-pn-data-vault',

      '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=No subject alternative DNS name matching ' +
        'api\\.selfcare\\.pagopa\\.it found',
    ),
    title: '[DOWNSTREAM SelfcarePG] Errore certificato su api.selfcare.pagopa.it',
    resolution: SELFCARE_RECOVERY_RESOLUTION,
    details: [
      ['Servizio', 'pn-data-vault'],
      ['Errore', '{{vars.dataVaultErrorMsg}}'],
      ['Trace ID', '{{vars.dataVaultTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Errore TLS: il certificato presentato dal downstream non contiene api.selfcare.pagopa.it tra i Subject Alternative Name.',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
      links: [slackLink(SELFCARE_INCIDENT_URL, 'Thread Slack del disservizio SelfcarePG')],
    },
  }),
];
