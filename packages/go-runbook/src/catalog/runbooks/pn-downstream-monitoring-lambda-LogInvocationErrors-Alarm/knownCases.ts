import { lambda, knownCase } from '../framework.js';
import type { KnownCase } from '../framework.js';
import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';
import { all, not } from '../common/conditions.js';
// Match exact JSON keys and values, in any order, in raw or serialized log evidence.
const QUOTE = '\\\\*"';
const SLOW_DOWN_PATTERN =
  '^(?=[\\s\\S]*Invoke Error\\b)' +
  `(?=[\\s\\S]*${QUOTE}errorType${QUOTE}\\s*:\\s*${QUOTE}SlowDown${QUOTE})` +
  `(?=[\\s\\S]*${QUOTE}errorMessage${QUOTE}\\s*:\\s*${QUOTE}Please reduce your request rate\\.${QUOTE})` +
  `(?=[\\s\\S]*${QUOTE}httpStatusCode${QUOTE}\\s*:\\s*503(?=\\s*[,}]))`;
const S3_SLOW_DOWN = lambdaLogEvidenceMatches(
  `${SLOW_DOWN_PATTERN}(?=[\\s\\S]*(?:S3RestXmlProtocol\\b|middleware-sdk-s3/))`,
);
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'downstream-monitoring-s3-slow-down',
    description: 'S3 restituisce SlowDown 503 durante l’esecuzione della Lambda',
    priority: 130,
    condition: S3_SLOW_DOWN,
    title: 'Errore S3 SlowDown 503',
    resolution: 'Infra sta valutando di intervenire lato lambda/s3 per ridurre il throttling (da Sync Infra.)',
    level: 'warn',
    details: [
      ['Account con errori', '{{vars.downstreamMonitoringErrorAccounts}}'],
      ['Lambda request ID', '{{vars.lambdaRequestId}}'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'La chiamata S3 restituisce SlowDown HTTP 503.',
      finalActions: [],
      links: [],
    },
  }),
  knownCase({
    id: 'downstream-monitoring-aws-slow-down',
    description: 'AWS SlowDown HTTP 503: servizio e recupero da verificare',
    priority: 120,
    condition: all(lambdaLogEvidenceMatches(SLOW_DOWN_PATTERN), not(S3_SLOW_DOWN)),
    title: 'Errore SlowDown 503 nella Lambda downstream monitoring',
    resolution: 'Infra sta valutando di intervenire lato lambda/s3 per ridurre il throttling (da Sync Infra.)',
    details: [
      ['Errore', 'SlowDown: Please reduce your request rate.'],
      ['HTTP', '503'],
    ],
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Errore di invocazione SlowDown con HTTP 503 e messaggio Please reduce your request rate.',
      finalActions: [],
      links: [],
    },
  }),
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
];
