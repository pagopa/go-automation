/**
 * Known cases for the personal-data-vault-SelfcarePG-downstream-detection-Alarm runbook.
 */

import { SEND_DOWNSTREAMS } from '../framework.js';
import type { KnownCase } from '../framework.js';

const SELFCARE_INCIDENT_URL = 'https://pagopaspa.slack.com/archives/C0585442Z39/p1774447095884019';
const ANALYSIS_COMPLETED_FINAL_ACTION =
  'Analisi conclusa in autonomia dal team di GO. Non è necessario altro confronto';
const SELFCARE_RECOVERY_RESOLUTION =
  'Monitorare il downstream SelfCare e attenderne il ripristino; non sono disponibili azioni operative sul servizio esterno.';

/** Known SelfcarePG failures evaluated against the pn-data-vault SEP log group. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'selfcarepg-subject-alternative-name-mismatch',
    description: '[DOWNSTREAM SelfcarePG] Certificato non valido per api.selfcare.pagopa.it',
    priority: 100,
    condition: {
      type: 'contains',
      ref: 'steps.query-pn-data-vault',
      regex:
        '\\[DOWNSTREAM\\] Service SelfcarePG returned errors=No subject alternative DNS name matching ' +
        'api\\.selfcare\\.pagopa\\.it found',
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM SelfcarePG] Errore certificato su api.selfcare.pagopa.it\n' +
        `Risoluzione: ${SELFCARE_RECOVERY_RESOLUTION}\n` +
        'Servizio: pn-data-vault\n' +
        'Errore: {{vars.dataVaultErrorMsg}}\n' +
        'Trace ID: {{vars.dataVaultTraceId}}\n',
    },
    analysis: {
      resolution: SELFCARE_RECOVERY_RESOLUTION,
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Errore TLS: il certificato presentato dal downstream non contiene api.selfcare.pagopa.it tra i Subject Alternative Name.',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [ANALYSIS_COMPLETED_FINAL_ACTION],
      links: [{ url: SELFCARE_INCIDENT_URL, name: 'Thread Slack del disservizio SelfcarePG', type: 'slack' }],
    },
  },
];
