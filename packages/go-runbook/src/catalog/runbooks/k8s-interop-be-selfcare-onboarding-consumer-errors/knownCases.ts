import { INTEROP_DOWNSTREAMS, knownCase, type KnownCase } from '../framework.js';
import { all } from '../common/conditions.js';
import { stepEvidenceMatches } from '../common/evidenceConditions.js';
import { SELFCARE_ONBOARDING_CONSUMER_ALARM as ALARM } from './alarmDefinition.js';

const DETAILS = [
  ['Ambiente', '{{vars.interopEnvironment}}'],
  ['Log group', '{{vars.interopLogGroup}}'],
  ['Servizio', '{{vars.interopPodApp}}'],
  ['CID analizzati', `{{vars.${ALARM.varPrefix}CidCount}}`],
] as const;

/** Sources: Confluence 2145419266 v5/v8-v12; the two additional cases are explicitly Test-only. */
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  knownCase({
    id: 'selfcare-kafka-broker-communication-errors',
    description: 'Errore di comunicazione KafkaJS verso i broker Selfcare',
    priority: 100,
    condition: all(
      { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'prod' },
      stepEvidenceMatches(
        ALARM.stepIds.queryApplicationLogs,
        [
          'The coordinator is not aware of this member',
          'The group coordinator is not available',
          'KafkaJS\\s*NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
          'Connection error: read ECONNRESET\\b',
        ].join('|'),
      ),
    ),
    resolution: 'PIN-7325',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
      links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
      finalActions: [],
    },
  }),
  knownCase({
    id: 'selfcare-onboarding-consume-message-conflict',
    description: 'HTTP 409 durante il consumo di un messaggio',
    priority: 110,
    condition: all(
      { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'test' },
      stepEvidenceMatches(
        ALARM.stepIds.queryApplicationLogs,
        'Error consuming message in partition \\d+ with offset \\d+\\. Reason: AxiosError: Request failed with status code 409\\b',
      ),
    ),
    resolution: 'Thread Slack 06/10/2026.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1791290447067119',
          name: 'Thread Slack 06/10/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
  knownCase({
    id: 'selfcare-onboarding-offset-commit-server-error',
    description: 'Errore del server Kafka durante OffsetCommit',
    priority: 105,
    condition: all(
      { type: 'compare', ref: 'vars.interopEnvironment', operator: '==', value: 'test' },
      stepEvidenceMatches(
        ALARM.stepIds.queryApplicationLogs,
        'Response OffsetCommit\\(key: 8, version: 5\\) - The server experienced an unexpected error when processing the request',
      ),
    ),
    resolution: 'Thread Slack 14/10/2026.',
    details: DETAILS,
    analysis: {
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
      finalActions: [],
      links: [
        {
          url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1791988082311309',
          name: 'Thread Slack 14/10/2026',
          type: 'SLACK',
        },
      ],
    },
  }),
];
