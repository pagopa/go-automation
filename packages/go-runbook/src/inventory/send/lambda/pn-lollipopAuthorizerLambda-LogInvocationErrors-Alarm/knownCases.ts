/**
 * Known cases for the pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 */
import { knownCase, lambda, lambdaLogEvidenceMatches, SEND_DOWNSTREAMS } from '../../../../toolkits/send/index.js';
import { all, any, type KnownCase } from '../../../../engine/index.js';
import { IDP_CERT_ERROR_PATTERN, IDP_KEYS_TIMEOUT_PATTERN } from './knownErrors.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'app-io-backend-idp-keys-unavailable',
    description: '[DOWNSTREAM AppIO - backend IO] Timeout o errore nel recupero delle chiavi CIE/SPID',
    condition: any(
      lambdaLogEvidenceMatches(IDP_KEYS_TIMEOUT_PATTERN),
      lambdaLogEvidenceMatches(IDP_CERT_ERROR_PATTERN),
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
