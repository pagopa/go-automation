import type { Core } from '@go-automation/go-common';
import type { AlarmAnalysisDto, AlarmEventDto, WatchtowerClient } from '@go-automation/go-watchtower-client';
import { executeRunbookForOccurrence } from 'go-analyze-alarm/api';
import { classifyRunbookOutcome } from '@go-automation/go-runbook';
import type { ServiceRegistry } from '@go-automation/go-runbook';

import type { AnalysisMatch, RtaCheckEvent, RtaCheckRow } from '../types/RtaCheckReport.js';
import type { AnalysisMatcherFn } from '../compare/AnalysisMatcher.js';
import type { MatchAnalysisOptions } from '../compare/matchAnalysis.js';
import { loadCachedOutput, saveCachedOutput } from '../runner/resumeCache.js';
import type { RunbookCacheDescriptor } from '../runner/RunbookCacheDescriptor.js';
import { buildCacheMeta, computeFingerprint } from '../runner/runbookFingerprint.js';

/** Per-occurrence orchestration context (built once, reused across occurrences). */
export interface CheckContext {
  readonly services: ServiceRegistry;
  /** Silent logger for the runbook engine, so its verbose logs are suppressed. */
  readonly engineLogger: Core.GOLogger;
  readonly client: WatchtowerClient;
  /** GOScript instance, used to resolve the resume cache path (CACHE type). */
  readonly script: Core.GOScript;
  readonly productId: string;
  readonly productName: string;
  readonly alarmName: string;
  /** Per-run runbook identity + structural hash; `undefined` when unregistered. */
  readonly runbook: RunbookCacheDescriptor | undefined;
  readonly awsProfiles: ReadonlyArray<string>;
  readonly analysisCache: Map<string, AlarmAnalysisDto | undefined>;
  readonly analysisMatcher: AnalysisMatcherFn;
  readonly matchOptions: MatchAnalysisOptions;
  readonly force: boolean;
}

/**
 * Runs (or reuses the cached) runbook for one occurrence, classifies V1, fetches
 * the linked analysis and computes the V2 comparison.
 *
 * @param context - The shared per-run context
 * @param event - The alarm-event occurrence
 * @returns The assembled report row
 */
export async function checkOccurrence(context: CheckContext, event: AlarmEventDto): Promise<RtaCheckRow> {
  const meta =
    context.runbook !== undefined ? buildCacheMeta(context.runbook, context.awsProfiles, event.firedAt) : undefined;
  const fingerprint = meta !== undefined ? computeFingerprint(meta) : undefined;

  let output =
    context.force || fingerprint === undefined
      ? undefined
      : await loadCachedOutput(context.script, context.alarmName, event.id, fingerprint);
  const fromCache = output !== undefined;

  if (output === undefined) {
    try {
      output = await executeRunbookForOccurrence(
        { services: context.services, logger: context.engineLogger },
        {
          alarmName: context.alarmName,
          firedAt: event.firedAt,
          awsAccountId: event.awsAccountId,
          region: event.awsRegion,
          awsProfiles: context.awsProfiles,
        },
      );
      if (meta !== undefined && fingerprint !== undefined) {
        await saveCachedOutput(context.script, context.alarmName, event.id, output, meta, fingerprint);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        event: toEventInfo(event),
        runbook: { status: 'EXECUTION-ERROR', matchedCaseIds: [], error: message },
        comparison: failedComparison(event.analysisId !== null),
        fromCache: false,
      };
    }
  }

  const check = classifyRunbookOutcome(output);
  const analysis = event.analysisId !== null ? await fetchAnalysisCached(context, event.analysisId) : undefined;
  const comparison = await context.analysisMatcher(output, check, analysis, event.firedAt, context.matchOptions);
  return { event: toEventInfo(event), runbook: check, comparison, fromCache };
}

async function fetchAnalysisCached(context: CheckContext, analysisId: string): Promise<AlarmAnalysisDto | undefined> {
  if (context.analysisCache.has(analysisId)) return context.analysisCache.get(analysisId);
  let analysis: AlarmAnalysisDto | undefined;
  try {
    analysis = await context.client.getAnalysis(context.productId, analysisId);
  } catch {
    analysis = undefined;
  }
  context.analysisCache.set(analysisId, analysis);
  return analysis;
}

function toEventInfo(event: AlarmEventDto): RtaCheckEvent {
  return {
    id: event.id,
    firedAt: event.firedAt,
    awsAccountId: event.awsAccountId,
    awsRegion: event.awsRegion,
    ...(event.environment !== undefined ? { environment: event.environment.name } : {}),
    ...(event.analysisId !== null ? { analysisId: event.analysisId } : {}),
  };
}

function failedComparison(hasAnalysis: boolean): AnalysisMatch {
  return {
    status: hasAnalysis ? 'NO_EVIDENCE' : 'NOT_LINKED',
    confidence: 0,
    reasons: ['Runbook non eseguito (errore di esecuzione).'],
    signals: {
      caseIdMentioned: false,
      descriptionOverlap: 0,
      traceIdOverlap: [],
      downstreamOverlap: [],
      errorKeywordOverlap: [],
    },
  };
}
