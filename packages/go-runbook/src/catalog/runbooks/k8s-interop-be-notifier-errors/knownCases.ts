import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';

import { all } from '../common/conditions.js';
import { varEquals } from '../common/varConditions.js';
import { interopKnownCase, type InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { NOTIFIER_ALARM as alarm } from './alarmDefinition.js';
const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};
function inEnvironment(rule: KnownCase, environment: 'prod' | 'test'): KnownCase {
  return { ...rule, condition: all(varEquals('interopEnvironment', environment), rule.condition) };
}
export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  inEnvironment(
    interopKnownCase(REFS, {
      id: 'notifier-unsupported-catalog-descriptor-state',
      description: 'Stato del catalog descriptor non gestito dal notifier',
      priority: 100,
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
    'prod',
  ),
  inEnvironment(
    interopKnownCase(REFS, {
      id: 'notifier-organization-id-not-found',
      description: 'Organization ID associato al messaggio SQS non trovato',
      priority: 90,
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
    'test',
  ),
];
