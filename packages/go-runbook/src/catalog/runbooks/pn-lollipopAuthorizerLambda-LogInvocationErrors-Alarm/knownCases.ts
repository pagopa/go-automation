/**
 * Known cases for the pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 */

import { lambda, SEND_DOWNSTREAMS } from '../framework.js';
import type { Condition, KnownCase } from '../framework.js';

const JIRA_BROWSE = 'https://pagopa.atlassian.net/browse';
const XRAY_SLACK_11_MAY = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1778514522543109';
const XRAY_SLACK_25_MAY = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1779714501970569';
const APP_IO_SLACK =
  'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1779713635239249?thread_ts=1779460059.183959&cid=C064KJYNLPL';

function matchLambdaLog(regex: string): Condition {
  return {
    type: 'or',
    conditions: [
      { type: 'contains', ref: 'steps.query-lambda-invocation', regex },
      { type: 'contains', ref: 'steps.query-lambda-errors', regex },
    ],
  };
}

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  {
    id: 'app-io-backend-idp-keys-unavailable',
    description: '[DOWNSTREAM AppIO - backend IO] Timeout o errore nel recupero delle chiavi CIE/SPID',
    priority: 110,
    condition: {
      type: 'or',
      conditions: [
        matchLambdaLog(
          'Errore nella chiamata idpKeys(?:CieGet|SpidTagGet):[\\s\\S]*Message:\\s*Timeout of 1000ms exceeded',
        ),
        matchLambdaLog('IDP_CERT_DATA_RETRIEVING_ERROR'),
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] [DOWNSTREAM AppIO - backend IO] Recupero chiavi CIE/SPID non disponibile\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: nessuna azione possibile al momento; attendere il ripristino del backend di IO.\n',
    },
    analysis: {
      resolution: 'Nessuna azione possibile al momento; attendere il ripristino del backend di IO.',
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.APP_IO],
      finalActions: ['Attendere il ripristino del backend di IO'],
      links: [{ url: APP_IO_SLACK, name: 'Thread Slack 25/05/2026', type: 'SLACK' }],
    },
  },
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  {
    id: 'missing-aws-lambda-trace-data-xray',
    description: 'Falso positivo X-Ray per dati di tracing Lambda mancanti',
    priority: 90,
    condition: matchLambdaLog('Missing AWS Lambda trace data for X-Ray'),
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] Missing AWS Lambda trace data for X-Ray\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: nessuna azione; falso positivo causato da librerie Node già rimosse dalle Lambda interessate.\n',
    },
    analysis: {
      resolution: 'Nessuna azione; falso positivo causato da librerie Node già rimosse dalle Lambda interessate.',
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      links: [
        { url: `${JIRA_BROWSE}/PN-20042`, name: 'PN-20042', type: 'JIRA' },
        { url: XRAY_SLACK_11_MAY, name: 'Thread Slack 11/05/2026', type: 'SLACK' },
        { url: XRAY_SLACK_25_MAY, name: 'Thread Slack 25/05/2026', type: 'SLACK' },
      ],
    },
  },
  {
    id: 'register-it-signature-validation-error',
    description: 'Errore noto di validazione firma per il provider SPID register.it',
    priority: 89,
    condition: {
      type: 'and',
      conditions: [
        matchLambdaLog('SIGNATURE_VALIDATION_ERROR'),
        matchLambdaLog("entityID:\\s*'https://spid\\.register\\.it'"),
      ],
    },
    action: {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      message:
        '[CASO NOTO] Firma non valida per il provider SPID register.it\n' +
        'requestId: {{vars.lambdaRequestId}}\n' +
        'Risoluzione: nessuna azione per entityID https://spid.register.it; segnalare il caso se riguarda un provider differente.\n',
    },
    analysis: {
      resolution:
        'Nessuna azione per entityID https://spid.register.it; segnalare il caso se riguarda un provider differente.',
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      links: [{ url: `${JIRA_BROWSE}/PN-19959`, name: 'PN-19959', type: 'JIRA' }],
    },
  },
];
