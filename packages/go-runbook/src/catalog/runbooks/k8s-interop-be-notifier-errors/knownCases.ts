import { INTEROP_DOWNSTREAMS, type KnownCase } from '../framework.js';
import { jiraLink, slackLink } from '../common/analysisLinks.js';
import { all } from '../common/conditions.js';
import { varEquals } from '../common/varConditions.js';
import { interopKnownCase, type InteropKnownCaseRefs } from '../interop/interopKnownCases.js';
import { NOTIFIER_ALARM as alarm } from './alarmDefinition.js';

const REFS: InteropKnownCaseRefs = {
  applicationLogsStepId: alarm.stepIds.queryApplicationLogs,
  cidTrackerStepId: alarm.stepIds.queryCidTracker,
  varPrefix: alarm.varPrefix,
};

const ORGANIZATION_NOT_FOUND_SLACK = 'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1788967779002349';

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
      resolution:
        'Il notifier non gestisce ancora lo stato ArchivingSuspended. Raccogliere CID ed evidenze e coinvolgere il team di prodotto tramite PIN-10510.',
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Il messaggio SQS contiene lo stato CatalogDescriptorState ArchivingSuspended non riconosciuto.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Segnalare al team di prodotto le evidenze associate allo stato ArchivingSuspended'],
      links: [jiraLink('PIN-10510')],
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
      resolution:
        'Raccogliere il CID e l’organization ID non risolto, quindi proseguire la verifica tramite PIN-10910 e il thread prodotto collegato.',
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      errorDetails: 'Il notifier non trova l’organizzazione associata all’identificativo ricevuto dal messaggio SQS.',
      downstreams: [INTEROP_DOWNSTREAMS.NESSUNO],
      finalActions: ['Verificare l’organization ID con il team di prodotto'],
      links: [jiraLink('PIN-10910'), slackLink(ORGANIZATION_NOT_FOUND_SLACK, 'Thread Slack 09/09/2026')],
    }),
    'test',
  ),
];
