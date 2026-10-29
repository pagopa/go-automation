import { knownCase, type KnownCase } from '../framework.js';
import { lambdaLogEvidenceMatches } from '../common/evidenceConditions.js';

const DETAILS = [['requestId', '{{vars.lambdaRequestId}}']] as const;

/** Sources: Confluence 3028910156 v4/v7/v8-v10; operational resolutions stay limited to those sources. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'jwt-iam-api-gateway-access-denied',
    description: 'Accesso ai tag API Gateway negato durante la generazione della policy IAM',
    priority: 150,
    condition: lambdaLogEvidenceMatches(
      'Error generating IAM policy[\\s\\S]*AccessDeniedException:[\\s\\S]*not authorized to perform: apigateway:GET[\\s\\S]*/tags/',
    ),
    resolution: 'PN-20045',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        { url: 'https://pagopa.atlassian.net/browse/PN-20045', name: 'PN-20045', type: 'JIRA' },
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1779705405047709',
          name: 'Thread Slack 25/05/2026',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1779718023684929',
          name: 'Secondo thread Slack 25/05/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'jwt-kms-key-not-found',
    description: 'Chiave KMS non trovata o keyId non valido durante la generazione della policy IAM',
    priority: 140,
    condition: lambdaLogEvidenceMatches(
      'Error generating IAM policy[\\s\\S]*NotFoundException: (?:Invalid keyId|Key [^\\r\\n]*arn:aws:kms:[^\\r\\n]* does not exist)',
    ),
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1782467352336189',
          name: 'Thread Slack 26/06/2026',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1791886750848049',
          name: 'Thread Slack 13/10/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'jwt-redis-cluster-down',
    description: 'Errore Redis CLUSTERDOWN durante la verifica della revoca JTI',
    priority: 130,
    condition: lambdaLogEvidenceMatches(
      'Error checking JTI revocation:[^\\r\\n]*CLUSTERDOWN (?:The cluster is down|Hash slot not served)\\b',
    ),
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1785246195381829',
          name: 'Thread Slack 28/07/2026',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1785247097259969',
          name: 'Secondo thread Slack 28/07/2026',
          type: 'SLACK',
        },
        {
          url: 'https://pagopaspa.slack.com/archives/C064KJYNLPL/p1790264847407049',
          name: 'Thread Slack 24/09/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'jwt-redis-socket-closed',
    description: 'Socket Redis chiuso inaspettatamente',
    priority: 120,
    condition: lambdaLogEvidenceMatches('Uncaught Exception[\\s\\S]*Socket closed unexpectedly[\\s\\S]*@redis/client/'),
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1781516312962849',
          name: 'Thread Slack 15/06/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'jwt-redis-disconnect-null',
    description: 'Errore di disconnessione Redis con client nullo',
    priority: 110,
    // This signature alone does not establish that the Redis cluster was down.
    condition: lambdaLogEvidenceMatches(
      "Error disconnecting from Redis: TypeError: Cannot read properties of null \\(reading 'disconnect'\\)",
    ),
    resolution: 'Risoluzione non documentata.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C087KRMD16E/p1785246195381829',
          name: 'Thread Slack 28/07/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
];
