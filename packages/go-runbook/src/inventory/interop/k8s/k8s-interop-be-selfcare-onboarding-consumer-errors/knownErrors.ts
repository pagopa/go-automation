import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';
import { SELFCARE_ONBOARDING_CONSUMER_ALARM as ALARM } from './alarmDefinition.js';

const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: ALARM.stepIds.queryApplicationLogs,
  cidTrackerStepId: ALARM.stepIds.queryCidTracker,
  varPrefix: ALARM.varPrefix,
};

/** Sources: Confluence 2145419266 v5/v8-v12; the two additional cases are explicitly Test-only. */
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBSOCE_SEL-ONB-KAF-BRO-ERR',
    description: 'Errore di comunicazione KafkaJS verso i broker Selfcare',
    environments: ['prod'],
    regex: [
      INTEROP_KAFKA_SIGNATURES.unknownMember,
      'The group coordinator is not available',
      'KafkaJS\\s*NumberOfRetriesExceeded: The replica is not available for the requested topic-partition',
      'Connection error: read ECONNRESET\\b',
    ].join('|'),
    evidence: 'APPLICATION_LOGS',
    resolution: 'PIN-7325',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
    finalActions: [],
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBSOCE_SEL-ONB-CON-MES-CON',
    description: 'HTTP 409 durante il consumo di un messaggio',
    environments: ['test'],
    regex:
      'Error consuming message in partition \\d+ with offset \\d+\\. Reason: AxiosError: Request failed with status code 409\\b',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Thread Slack 06/10/2026.',
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
  }),
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBSOCE_SEL-ONB-OFF-COM-SER-ERR',
    description: 'Errore del server Kafka durante OffsetCommit',
    environments: ['test'],
    regex:
      'Response OffsetCommit\\(key: 8, version: 5\\) - The server experienced an unexpected error when processing the request',
    evidence: 'APPLICATION_LOGS',
    resolution: 'Thread Slack 14/10/2026.',
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
  }),
];
