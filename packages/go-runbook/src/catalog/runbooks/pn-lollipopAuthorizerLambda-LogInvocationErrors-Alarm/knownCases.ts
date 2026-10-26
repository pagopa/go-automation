/**
 * Known cases for the pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 */
import { lambda, SEND_DOWNSTREAMS } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { all, any } from '../common/conditions.js';
import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'app-io-backend-idp-keys-unavailable',
    description: '[DOWNSTREAM AppIO - backend IO] Timeout o errore nel recupero delle chiavi CIE/SPID',
    priority: 110,
    condition: any(
      lambdaLogEvidenceMatches(
        'Errore nella chiamata idpKeys(?:CieGet|SpidTagGet):[\\s\\S]*Message:\\s*Timeout of 1000ms exceeded',
      ),
      lambdaLogEvidenceMatches('IDP_CERT_DATA_RETRIEVING_ERROR'),
    ),
    title: '[DOWNSTREAM AppIO - backend IO] Recupero chiavi CIE/SPID non disponibile',
    resolution: 'Risoluzione non documentata.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.APP_IO],
      finalActions: [],
      links: [],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  knownCase({
    id: 'missing-aws-lambda-trace-data-xray',
    description: 'Falso positivo X-Ray per dati di tracing Lambda mancanti',
    priority: 90,
    condition: lambdaLogEvidenceMatches('Missing AWS Lambda trace data for X-Ray'),
    title: 'Missing AWS Lambda trace data for X-Ray',
    resolution: 'PN-20042',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [
        { url: 'https://pagopa.atlassian.net/browse/PN-20042', name: 'PN-20042', type: 'JIRA' },
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1778514522543109',
          name: 'Thread Slack 11/05/2026',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1779714501970569',
          name: 'Thread Slack 25/05/2026',
          type: 'SLACK',
        },
      ],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'register-it-signature-validation-error',
    description: 'Errore noto di validazione firma per il provider SPID register.it',
    priority: 89,
    condition: all(
      lambdaLogEvidenceMatches('SIGNATURE_VALIDATION_ERROR'),
      lambdaLogEvidenceMatches("entityID:\\s*'https://spid\\.register\\.it'"),
    ),
    title: 'Firma non valida per il provider SPID register.it',
    resolution: 'PN-19959',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      links: [{ url: 'https://pagopa.atlassian.net/browse/PN-19959', name: 'PN-19959', type: 'JIRA' }],
      finalActions: [],
    },
  }),
];
