import { all, type KnownError, stepEvidenceMatches, varEquals } from '../../../../engine/index.js';
import { downstreamMarkerPattern, knownError, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';
/**
 * Known errors for the personal-data-vault-SelfcarePG-downstream-detection-Alarm runbook.
 */

/** Known SelfcarePG failures evaluated against the pn-data-vault SEP log group. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  // Watchtower analysis 01a06822-d18d-75cc-bf4d-45bf7adbfbcd and retained AWS logs, 3 September 2026.
  knownError({
    code: 'SEND_DOWNSTREAM_PDVSPGDDA_SEL-INS-ADD-HTT-500',
    description: '[DOWNSTREAM SelfcarePG] HTTP 500 durante l’aggiunta di un’istituzione',
    condition: stepEvidenceMatches(
      'query-pn-data-vault',
      `${downstreamMarkerPattern('SelfcarePG', {
        status: '500 Internal Server Error',
        method: 'POST',
        endpoint: 'https://api.selfcare.pagopa.it/external/data-vault/v1/pn-pg/institutions/add',
      })}(?=[;\\s"\\\\]|$)`,
    ),
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', 'pn-data-vault'],
      ['Endpoint', 'https://api.selfcare.pagopa.it/external/data-vault/v1/pn-pg/institutions/add'],
      ['Errore', '{{vars.dataVaultErrorMsg}}'],
      ['Trace ID', '{{vars.dataVaultTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'HTTP 500 restituito da SelfcarePG alla chiamata POST /external/data-vault/v1/pn-pg/institutions/add.',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
    },
  }),
  knownError({
    code: 'SEND_DOWNSTREAM_PDVSPGDDA_SEL-REA-TIM-WIT-EMP-ERR',
    description: '[DOWNSTREAM SelfcarePG] Timeout di lettura con dettaglio errore vuoto',
    condition: all(
      varEquals('dataVaultErrorMsg', '[DOWNSTREAM] Service SelfcarePG returned errors='),
      stepEvidenceMatches('query-pn-data-vault-trace', 'io\\.netty\\.handler\\.timeout\\.ReadTimeoutException'),
    ),
    title: '[DOWNSTREAM SelfcarePG] Timeout di lettura',
    resolution: 'Risoluzione non documentata.',
    details: [
      ['Servizio', 'pn-data-vault'],
      ['Endpoint', 'api.selfcare.pagopa.it:443'],
      ['Errore', '{{vars.dataVaultErrorMsg}}'],
      ['Trace ID', '{{vars.dataVaultTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'ReadTimeoutException verso api.selfcare.pagopa.it:443, correlata tramite X-Ray perché il log downstream non contiene il dettaglio dell’eccezione.',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [],
    },
  }),
  knownError({
    code: 'SEND_DOWNSTREAM_PDVSPGDDA_SEL-SUB-ALT-NAM-MIS',
    description: '[DOWNSTREAM SelfcarePG] Certificato non valido per api.selfcare.pagopa.it',
    condition: stepEvidenceMatches(
      'query-pn-data-vault',
      `${downstreamMarkerPattern(
        'SelfcarePG',
      )}No subject alternative DNS name matching api\\.selfcare\\.pagopa\\.it found`,
    ),
    title: '[DOWNSTREAM SelfcarePG] Errore certificato su api.selfcare.pagopa.it',
    resolution: 'Riferimento: thread Slack sul disservizio Selfcare del 25/03/2026.',
    details: [
      ['Servizio', 'pn-data-vault'],
      ['Errore', '{{vars.dataVaultErrorMsg}}'],
      ['Trace ID', '{{vars.dataVaultTraceId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails:
        'Errore TLS: il certificato presentato dal downstream non contiene api.selfcare.pagopa.it tra i Subject Alternative Name.',
      downstreams: [SEND_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C0585442Z39/p1774447095884019',
          name: 'Thread Slack del disservizio SelfcarePG',
          type: 'SLACK',
        },
      ],
    },
  }),
];
