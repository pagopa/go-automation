import { omitUndefined } from '@pagopa/go-common/utils';

import { applyPipelineHooks } from '../../../../engine/internal.js';
import type { AlarmRunbookBuilder } from '../../../common/builders/AlarmRunbookBuilder.js';
import { AnalyzeInteropApplicationLogsStep } from '../steps/AnalyzeInteropApplicationLogsStep.js';
import { AnalyzeInteropCidTrackerStep } from '../steps/AnalyzeInteropCidTrackerStep.js';
import { QueryInteropApplicationLogsStep } from '../steps/QueryInteropApplicationLogsStep.js';
import { QueryInteropCidTrackerStep } from '../steps/QueryInteropCidTrackerStep.js';
import type { InteropCidPipeline } from '../types/InteropCidPipeline.js';

/**
 * Appends the tail of an INTEROP alarm pipeline: the application logs of the service and their analysis, the CID
 * tracker of the CIDs they carry, the hooks at `before-cid-analysis` and the analysis of the tracker.
 *
 * @param builder - Builder of the runbook, after the steps of the family
 * @param pipeline - Step ids, labels, queries and hooks of the tail
 *
 * @example
 * ```typescript
 * appendInteropCidPipeline(builder, { stepIds, applicationLabel: 'log applicativi interop-be-x', … });
 * ```
 */
export function appendInteropCidPipeline(builder: AlarmRunbookBuilder, pipeline: InteropCidPipeline): void {
  const { stepIds } = pipeline;
  builder.step(
    new QueryInteropApplicationLogsStep({
      id: stepIds.queryApplicationLogs,
      label: `Query ${pipeline.applicationLabel}`,
      timeRangeFromParams: pipeline.applicationTimeRange,
      queryProfileId: pipeline.applicationLogsQueryProfileId,
      buildQuery: pipeline.buildApplicationLogsQuery,
    }),
  );

  builder.step(
    new AnalyzeInteropApplicationLogsStep({
      id: stepIds.analyzeApplicationLogs,
      label: `Analisi ${pipeline.applicationLabel}`,
      fromStep: stepIds.queryApplicationLogs,
      varPrefix: pipeline.varPrefix,
      ...omitUndefined({ countField: pipeline.countField }),
    }),
  );

  builder.step(
    new QueryInteropCidTrackerStep({
      id: stepIds.queryCidTracker,
      label: 'Query CID tracker INTEROP',
      fromStep: stepIds.analyzeApplicationLogs,
      timeRangeFromParams: pipeline.cidTrackerTimeRange,
      queryProfileId: pipeline.cidTrackerQueryProfileId,
      buildQuery: pipeline.buildCidTrackerQuery,
    }),
  );

  applyPipelineHooks(builder, pipeline.hooks, 'before-cid-analysis', pipeline.reachedAnchors);

  builder.step(
    new AnalyzeInteropCidTrackerStep({
      id: stepIds.analyzeCidTracker,
      label: 'Analisi CID tracker INTEROP',
      fromStep: stepIds.queryCidTracker,
    }),
  );
}
