import { interop, type Runbook } from '../framework.js';
import { DELEGATION_OUTBOUND_WRITER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { DELEGATION_OUTBOUND_WRITER_QUERY_PROFILE } from './queryProfile.js';
import { QueryDelegationOutboundWriterContextStep } from './QueryDelegationOutboundWriterContextStep.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3375694080/k8s-interop-be-delegation-outbound-writer-errors';

export function buildRunbook(): Runbook {
  const runbook = interop.k8s.createInteropK8sAlarmRunbook({
    id: alarm.runbookKey,
    metadata: {
      name: alarm.runbookKey,
      description: 'Analizza gli errori Kafka del delegation outbound writer e raccoglie il contesto anche senza CID.',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'delegation', 'writer', 'kafka'],
    },
    service: { name: alarm.podApp, logGroup: alarm.logGroup, varPrefix: alarm.varPrefix },
    resolveAlarmContext: alarm.resolveContext,
    knownCases: KNOWN_CASES,
    queryProfile: DELEGATION_OUTBOUND_WRITER_QUERY_PROFILE,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
  const contextStep = { step: new QueryDelegationOutboundWriterContextStep() };
  return {
    ...runbook,
    analysisDefaults: {
      ...runbook.analysisDefaults,
      // Use the Service verified in the production Watchtower census.
      resources: [{ name: alarm.podApp, type: 'Service', role: 'PRIMARY' }],
    },
    steps: runbook.steps.flatMap((descriptor) =>
      descriptor.step.id === alarm.stepIds.analyzeCidTracker ? [contextStep, descriptor] : [descriptor],
    ),
  };
}
