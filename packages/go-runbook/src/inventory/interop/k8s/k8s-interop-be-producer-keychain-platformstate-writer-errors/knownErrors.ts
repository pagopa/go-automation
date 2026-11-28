import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopErrorLine,
  interopK8sKnownError,
  type InteropK8sKnownErrorRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownError } from '../../../../engine/index.js';

import { PRODUCER_KEYCHAIN_PLATFORMSTATE_WRITER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownErrorRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_ERRORS: ReadonlyArray<KnownError> = [
  interopK8sKnownError(REFS, {
    code: 'INTEROP_K8S_K8IBPKPWE_PRO-KEY-PLA-WRI-KAF-COO-UNK-MEM',
    description: 'Problemi di connessione al cluster Kafka',
    environments: ['prod', 'att'],
    regex: interopErrorLine(
      INTEROP_KAFKA_SIGNATURES.unknownMemberHeartbeat,
      INTEROP_KAFKA_SIGNATURES.unknownMemberRejoinWithReason,
    ),
    evidence: 'APPLICATION_LOGS',
    resolution: 'Risoluzione non documentata. Riferimento: PIN-7325.',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails:
      'Il coordinator Kafka non riconosce il consumer del platformstate writer, che tenta il rejoin del gruppo.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
  }),
];
