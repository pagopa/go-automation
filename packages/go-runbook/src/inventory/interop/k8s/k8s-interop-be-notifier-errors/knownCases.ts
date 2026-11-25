import {
  INTEROP_DOWNSTREAMS,
  interopK8sKnownCase,
  type InteropK8sKnownCaseRefs,
} from '../../../../toolkits/interop/index.js';
import type { KnownCase } from '../../../../engine/index.js';

import { NOTIFIER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropK8sKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  interopK8sKnownCase(REFS, {
    id: 'notifier-unsupported-catalog-descriptor-state',
    description: 'Stato del catalog descriptor non gestito dal notifier',
    environments: ['prod'],
    regex:
      'Error trying to consume a message from SQS - Unable to deserialize json as a CatalogDescriptorState:[^\\n]*ArchivingSuspended',
    resolution: 'PIN-10510',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il messaggio SQS contiene lo stato CatalogDescriptorState ArchivingSuspended non riconosciuto.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [{ url: 'https://pagopa.atlassian.net/browse/PIN-10510', name: 'PIN-10510', type: 'JIRA' }],
  }),
  interopK8sKnownCase(REFS, {
    id: 'notifier-organization-id-not-found',
    description: 'Organization ID associato al messaggio SQS non trovato',
    environments: ['test'],
    regex:
      'Error trying to consume a message from SQS - No organizationId found associated to [0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
    resolution: 'PIN-10910',
    proposedStatus: 'IN_PROGRESS',
    analysisType: 'ANALYZABLE',
    errorDetails: 'Il notifier non trova l’organizzazione associata all’identificativo ricevuto dal messaggio SQS.',
    downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
    finalActions: [],
    links: [
      { url: 'https://pagopa.atlassian.net/browse/PIN-10910', name: 'PIN-10910', type: 'JIRA' },
      {
        url: 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1788967779002349',
        name: 'Thread Slack 09/09/2026',
        type: 'SLACK',
      },
    ],
  }),
];
