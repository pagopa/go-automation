/**
 * Known cases for the pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm runbook.
 */

import { lambda, SEND_DOWNSTREAMS } from '../framework.js';
import { knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';

import { jiraLink, slackLink } from '../common/analysisLinks.js';
import { all, any } from '../common/conditions.js';
import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';

const XRAY_SLACK_11_MAY = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1778514522543109';
const XRAY_SLACK_25_MAY = 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1779714501970569';
const APP_IO_SLACK =
  'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1779713635239249?thread_ts=1779460059.183959&cid=C064KJYNLPL';

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
    resolution: 'Nessuna azione possibile al momento; attendere il ripristino del backend di IO.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      downstreams: [SEND_DOWNSTREAMS.APP_IO],
      finalActions: ['Attendere il ripristino del backend di IO'],
      links: [slackLink(APP_IO_SLACK, 'Thread Slack 25/05/2026')],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  knownCase({
    id: 'missing-aws-lambda-trace-data-xray',
    description: 'Falso positivo X-Ray per dati di tracing Lambda mancanti',
    priority: 90,
    condition: lambdaLogEvidenceMatches('Missing AWS Lambda trace data for X-Ray'),
    title: 'Missing AWS Lambda trace data for X-Ray',
    resolution: 'Nessuna azione; falso positivo causato da librerie Node già rimosse dalle Lambda interessate.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      links: [
        jiraLink('PN-20042'),
        slackLink(XRAY_SLACK_11_MAY, 'Thread Slack 11/05/2026'),
        slackLink(XRAY_SLACK_25_MAY, 'Thread Slack 25/05/2026'),
      ],
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
    resolution:
      'Nessuna azione per entityID https://spid.register.it; segnalare il caso se riguarda un provider differente.',
    details: [['requestId', '{{vars.lambdaRequestId}}']],
    analysis: {
      proposedStatus: 'COMPLETED',
      analysisType: 'ANALYZABLE',
      links: [jiraLink('PN-19959')],
    },
  }),
];
