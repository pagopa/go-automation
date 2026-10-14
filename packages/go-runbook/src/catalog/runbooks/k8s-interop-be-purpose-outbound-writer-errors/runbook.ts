import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';
import { PURPOSE_OUTBOUND_WRITER_ALARM } from './alarmDefinition.js';
import { KNOWN_CASES } from './knownCases.js';
import { PURPOSE_OUTBOUND_WRITER_QUERY_PROFILE } from './queryProfile.js';
import { QueryPurposeOutboundContextStep } from './QueryPurposeOutboundContextStep.js';

const RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3317530626/k8s-interop-be-purpose-outbound-writer-errors';

export function buildRunbook(): Runbook {
  const runbook = interop.k8s.createInteropK8sAlarmRunbook({
    id: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey,
    metadata: {
      name: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del purpose outbound writer leggendo i log applicativi, estraendo i CID e consultando il CID tracker.',
      version: '1.1.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'purpose', 'outbound-writer', 'kafka'],
    },
    service: {
      name: PURPOSE_OUTBOUND_WRITER_ALARM.podApp,
      logGroup: PURPOSE_OUTBOUND_WRITER_ALARM.logGroup,
      varPrefix: PURPOSE_OUTBOUND_WRITER_ALARM.varPrefix,
    },
    resolveAlarmContext: PURPOSE_OUTBOUND_WRITER_ALARM.resolveContext,
    queryProfile: PURPOSE_OUTBOUND_WRITER_QUERY_PROFILE,
    knownCases: KNOWN_CASES,
    occurrenceTimeWindow: { beforeMinutes: 5, afterMinutes: 5 },
    analysisDefaults: {
      runbookName: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey,
      links: [{ url: RUNBOOK_URL, name: PURPOSE_OUTBOUND_WRITER_ALARM.runbookKey, type: 'CONFLUENCE' }],
    },
  });
  const contextStep = { step: new QueryPurposeOutboundContextStep() };
  // Collect context before AnalyzeCidTracker can resolve a known case early.
  return {
    ...runbook,
    steps: runbook.steps.flatMap((descriptor) =>
      descriptor.step.id === PURPOSE_OUTBOUND_WRITER_ALARM.stepIds.analyzeCidTracker
        ? [contextStep, descriptor]
        : [descriptor],
    ),
  };
}
