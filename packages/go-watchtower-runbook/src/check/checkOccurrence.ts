import type { Core } from '@go-automation/go-common';
import type { AlarmAnalysisDto, AlarmEventDto, WatchtowerClient } from '@go-automation/go-watchtower-client';
import { executeRunbookForOccurrence } from '@go-automation/go-runbook/catalog';
import { classifyRunbookOutcome } from '@go-automation/go-runbook';
import type { RunbookOutput, ServiceRegistry } from '@go-automation/go-runbook';

import type { AnalysisMatch, RtaCheckEvent, RtaCheckRow } from '../types/RtaCheckReport.js';
import type { AnalysisMatcherFn } from '../comparison/AnalysisMatcher.js';
import type { MatchAnalysisOptions } from '../comparison/matchAnalysis.js';
import type { RunbookCacheDescriptor } from '../cache/RunbookCacheDescriptor.js';
import type { RunbookCheckCache } from '../cache/RunbookCheckCache.js';
import { runbookCheckCacheKey } from '../cache/RunbookCheckCache.js';
import { buildCacheMeta, computeFingerprint } from '../cache/runbookFingerprint.js';

/** Per-occurrence orchestration context (built once, reused across occurrences). */
export interface RunbookCheckContext {
  readonly services: ServiceRegistry;
  /** Silent logger for the runbook engine, so its verbose logs are suppressed. */
  readonly engineLogger: Core.GOLogger;
  readonly client: WatchtowerClient;
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

export interface CheckOccurrenceInput {
  readonly context: RunbookCheckContext;
  readonly occurrence: AlarmEventDto;
  /** Optional resume cache; without it every occurrence re-executes the runbook. */
  readonly cache?: RunbookCheckCache;
}

/**
 * Runs (or reuses the cached) runbook for one occurrence, classifies V1, fetches
 * the linked analysis and computes the V2 comparison.
 *
 * @param input - The shared context, the occurrence and the optional resume cache
 * @returns The assembled report row
 */
export async function checkOccurrence(input: CheckOccurrenceInput): Promise<RtaCheckRow> {
  const { context, occurrence: event, cache } = input;
  const meta =
    context.runbook !== undefined
      ? buildCacheMeta(context.runbook, context.awsProfiles, event.firedAt, event.awsAccountId, event.awsRegion)
      : undefined;
  const fingerprint = meta !== undefined ? computeFingerprint(meta) : undefined;
  const key = runbookCheckCacheKey(context.alarmName, event.id);

  let output =
    context.force || fingerprint === undefined || cache === undefined
      ? undefined
      : await loadFreshOutput(cache, key, fingerprint);
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
      if (cache !== undefined && meta !== undefined && fingerprint !== undefined) {
        await cache.set(key, { fingerprint, savedAt: new Date().toISOString(), meta, output });
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

/** Returns the cached output only when its fingerprint still matches the current inputs. */
async function loadFreshOutput(
  cache: RunbookCheckCache,
  key: string,
  expectedFingerprint: string,
): Promise<RunbookOutput | undefined> {
  const cached = await cache.get(key);
  // Stale guard: a fingerprint mismatch (or a legacy entry without one) is a miss.
  if (cached?.fingerprint !== expectedFingerprint) return undefined;
  return cached.output;
}

async function fetchAnalysisCached(
  context: RunbookCheckContext,
  analysisId: string,
): Promise<AlarmAnalysisDto | undefined> {
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
