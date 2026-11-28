import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopErrorLine,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';

import { PURPOSE_READMODEL_WRITER_SQL_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBPRWSE_PUR-REA-WRI-SQL-KAF-COO-MEM-REJ',
    description: 'Rejoin del consumer Kafka del purpose readmodel writer SQL; causa da verificare',
    environments: ['prod'],
    regex: interopErrorLine(INTEROP_KAFKA_SIGNATURES.unknownMemberRejoin),
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata. Riferimento: PIN-7325.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails:
      'Errore che sembrerebbe assimilabile ai problemi di comunicazione verso Kafka citati in PIN-7325; da verificare.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1773057607941239',
        name: 'Thread Slack 09/03/2026',
        type: 'SLACK',
      },
    ],
  }),
];
