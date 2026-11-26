import {
  INTEROP_DOWNSTREAMS,
  INTEROP_KAFKA_SIGNATURES,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';

import { IN_APP_NOTIFICATION_DISPATCHER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'in-app-notification-dispatcher-kafka-coordinator-member-rejoin',
    description: 'Il coordinator Kafka non riconosce il consumer dell’in-app notification dispatcher',
    // Confluence censisce solo Prod e attribuisce il messaggio al dispatcher.
    // La query applicativa è filtrata sul suo pod; il CID tracker include anche altri servizi.
    environments: ['prod'],
    regex: INTEROP_KAFKA_SIGNATURES.unknownMemberRejoin,
    evidence: 'APPLICATION_LOGS',
    resolution: 'PIN-7325',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il consumer Kafka ha perso la sessione di gruppo e tenta di effettuare il rejoin.',
    // Selfcare è il downstream dichiarato dalla pagina; l’attribuzione resta da confermare.
    downstreams: [INTEROP_DOWNSTREAMS.SELFCARE],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-7325', name: 'PIN-7325', type: 'JIRA' }],
  }),
];
