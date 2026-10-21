import { interop, type Runbook } from '../framework.js';
import { DELEGATION_OUTBOUND_WRITER_ALARM as alarm } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { DELEGATION_OUTBOUND_WRITER_QUERY_PROFILE } from './queryProfile.js';
import { QueryDelegationOutboundWriterContextStep } from './QueryDelegationOutboundWriterContextStep.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3375694080/k8s-interop-be-delegation-outbound-writer-errors';

export function buildRunbook(): Runbook {
  const contextStep = { step: new QueryDelegationOutboundWriterContextStep() };
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
    additionalLogEvidence: [
      {
        id: 'delegation-outbound-writer-context',
        label: 'Contesto di riavvio e rejoin del delegation outbound writer',
        sourceStep: contextStep.step.id,
        // Keep initial restart/rejoin signals; the query rejects 1,000 rows or more.
        maxLogLines: 1000,
      },
    ],
    analysisDefaults: {
      runbookName: alarm.runbookKey,
      links: [{ url: CONFLUENCE_RUNBOOK_URL, name: alarm.runbookKey, type: 'CONFLUENCE' }],
    },
  });
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
