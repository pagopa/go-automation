import { CATALOG_PLATFORMSTATE_WRITER_ALARM } from './alarmDefinition.js';
import { interop } from '../framework.js';
import type { Runbook } from '../framework.js';

import { KNOWN_CASES } from './knownCases.js';
import { PLATFORMSTATE_WRITER_QUERY_PROFILE } from './queryProfile.js';
import { QueryWriterContextStep } from './QueryWriterContextStep.js';

const CONFLUENCE_RUNBOOK_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3298033847/k8s-interop-be-catalog-platformstate-writer-errors';

export function buildRunbook(): Runbook {
  const runbook = interop.k8s.createInteropK8sAlarmRunbook({
    id: CATALOG_PLATFORMSTATE_WRITER_ALARM.runbookKey,
    metadata: {
      name: CATALOG_PLATFORMSTATE_WRITER_ALARM.runbookKey,
      description:
        'Analizza gli allarmi k8s INTEROP del catalog platformstate writer leggendo i log applicativi, ' +
        'estraendo i CID e consultando il CID tracker.',
      version: '1.1.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['interop', 'k8s', 'service', 'catalog', 'platformstate', 'kafka'],
    },
    service: {
      name: CATALOG_PLATFORMSTATE_WRITER_ALARM.podApp,
      logGroup: CATALOG_PLATFORMSTATE_WRITER_ALARM.logGroup,
      varPrefix: CATALOG_PLATFORMSTATE_WRITER_ALARM.varPrefix,
    },
    resolveAlarmContext: CATALOG_PLATFORMSTATE_WRITER_ALARM.resolveContext,
    queryProfile: PLATFORMSTATE_WRITER_QUERY_PROFILE,
    knownCases: KNOWN_CASES,
    analysisDefaults: {
      runbookName: CATALOG_PLATFORMSTATE_WRITER_ALARM.runbookKey,
      links: [
        {
          url: CONFLUENCE_RUNBOOK_URL,
          name: CATALOG_PLATFORMSTATE_WRITER_ALARM.runbookKey,
          type: 'CONFLUENCE',
        },
      ],
    },
  });
  const contextStep = { step: new QueryWriterContextStep() };
  // AnalyzeCidTracker signals early resolution: collect context before that step.
  return {
    ...runbook,
    steps: runbook.steps.flatMap((descriptor) =>
      descriptor.step.id === CATALOG_PLATFORMSTATE_WRITER_ALARM.stepIds.analyzeCidTracker
        ? [contextStep, descriptor]
        : [descriptor],
    ),
  };
}
