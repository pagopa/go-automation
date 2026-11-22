import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { appendInteropCidPipeline } from '../appendInteropCidPipeline.js';
import { AlarmRunbookBuilder } from '../../../../common/builders/AlarmRunbookBuilder.js';
import { logAction } from '../../../../../engine/actions/ActionFactories.js';
import type { Step } from '../../../../../engine/types/Step.js';
import {
  buildInteropK8sApplicationLogsQuery,
  buildInteropK8sCidTrackerQuery,
} from '../../queries/interopK8sQueries.js';
import { TEST_RUNBOOK_METADATA } from '../../../../../__tests__/helpers/TEST_RUNBOOK_METADATA.js';

const probe: Step = {
  id: 'probe',
  label: 'Probe',
  kind: 'transform',
  async execute() {
    await Promise.resolve();
    return { success: true };
  },
};

describe('appendInteropCidPipeline', () => {
  it('appends application logs, CID tracker, the hooks before the CID analysis and the analysis', () => {
    const builder = AlarmRunbookBuilder.create('probe').metadata(TEST_RUNBOOK_METADATA);
    const reachedAnchors = new Set<'before-cid-analysis'>();
    appendInteropCidPipeline(builder, {
      stepIds: {
        queryApplicationLogs: 'query-app',
        analyzeApplicationLogs: 'analyze-app',
        queryCidTracker: 'query-tracker',
        analyzeCidTracker: 'analyze-tracker',
      },
      applicationLabel: 'log applicativi app',
      applicationTimeRange: { start: 'startTime', end: 'alarmDatetime' },
      applicationLogsQueryProfileId: 'app-profile',
      buildApplicationLogsQuery: buildInteropK8sApplicationLogsQuery,
      varPrefix: 'app',
      countField: 'count',
      cidTrackerTimeRange: { start: 'startTime', end: 'endTime' },
      cidTrackerQueryProfileId: 'tracker-profile',
      buildCidTrackerQuery: buildInteropK8sCidTrackerQuery,
      hooks: [{ at: 'before-cid-analysis', step: probe }],
      reachedAnchors,
    });
    const runbook = builder.fallback(logAction({ level: 'info', title: 'fallback' })).build();

    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => [step.id, step.label]),
      [
        ['query-app', 'Query log applicativi app'],
        ['analyze-app', 'Analisi log applicativi app'],
        ['query-tracker', 'Query CID tracker INTEROP'],
        ['probe', 'Probe'],
        ['analyze-tracker', 'Analisi CID tracker INTEROP'],
      ],
    );
    assert.deepStrictEqual([...reachedAnchors], ['before-cid-analysis']);
  });
});
