import type { Core } from '@go-automation/go-common';
import { isAWSTargetNotConfiguredError } from '@go-automation/go-common/aws';

import type { AlarmAnalysisDto, AlarmEventDto, WatchtowerClient } from '@go-automation/go-watchtower-client';
import { executeRunbookForOccurrence } from '@go-automation/go-runbook/catalog';
import { classifyRunbookOutcome } from '@go-automation/go-runbook';
import type { ServiceRegistryResolverFn } from '@go-automation/go-runbook';

import type { AnalysisMatch, RtaCheckEvent, RtaCheckRow } from '../types/RtaCheckReport.js';
import type { AnalysisMatcherFn } from '../comparison/AnalysisMatcher.js';
import type { MatchAnalysisOptions } from '../comparison/matchAnalysis.js';
import type { RunbookCacheDescriptor } from '../cache/RunbookCacheDescriptor.js';
import type { RunbookCheckCache } from '../cache/RunbookCheckCache.js';
import { runbookCheckCacheKey } from '../cache/RunbookCheckCache.js';
import { persistRunbookOutput, readFreshRunbookOutput } from '../cache/RunbookCheckCacheIO.js';
import { buildCacheMeta, computeFingerprint } from '../cache/runbookFingerprint.js';

/** Per-occurrence orchestration context (built once, reused across occurrences). */
export interface RunbookCheckContext {
  /**
   * Builds the collaborators bound to one account and region.
   *
   * Occurrences of a single alarm span several environments, so the services
   * are resolved per occurrence: log group and table names repeat identically
   * across accounts, and services left on the first configured profile answer
   * successfully with no rows for all the others.
   */
  readonly servicesFor: ServiceRegistryResolverFn;
  /** Silent logger for the runbook engine, so its verbose logs are suppressed. */
  readonly engineLogger: Core.GOLogger;
  readonly client: WatchtowerClient;
  readonly productId: string;
  readonly productName: string;
  readonly alarmName: string;
  /** Per-run runbook identity + structural hash; `undefined` when unregistered. */
  readonly runbook: RunbookCacheDescriptor | undefined;
  /**
   * Profiles configured for the whole run.
   *
   * Part of the cache fingerprint, because the configured set decides which
   * accounts are reachable at all, and it is known before any AWS call. What a
   * single occurrence actually read is narrower, and comes from the resolution:
   * see the execution telemetry below.
   */
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
      : await readFreshRunbookOutput(cache, key, fingerprint);
  const fromCache = output !== undefined;

  if (output === undefined) {
    try {
      const resolved = await context.servicesFor({ accountId: event.awsAccountId, region: event.awsRegion });
      output = await executeRunbookForOccurrence(
        { services: resolved.services, logger: context.engineLogger },
        {
          alarmName: context.alarmName,
          firedAt: event.firedAt,
          awsAccountId: event.awsAccountId,
          region: event.awsRegion,
          // The profiles bound to this occurrence's account, not every profile
          // configured for the run: the trace reports what was read.
          awsProfiles: resolved.awsProfiles,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = classifyExecutionFailure(error);
      return {
        event: toEventInfo(event),
        runbook: { status, matchedCaseIds: [], error: message },
        comparison: failedComparison(event.analysisId !== null, status),
        fromCache: false,
      };
    }
    if (cache !== undefined && meta !== undefined && fingerprint !== undefined) {
      await persistRunbookOutput(cache, key, {
        fingerprint,
        savedAt: new Date().toISOString(),
        meta,
        output,
      });
    }
  }

  const check = classifyRunbookOutcome(output);
  const analysis = event.analysisId !== null ? await fetchAnalysisCached(context, event.analysisId) : undefined;
  const comparison = await context.analysisMatcher(output, check, analysis, event.firedAt, context.matchOptions);
  return { event: toEventInfo(event), runbook: check, comparison, fromCache };
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

/**
 * Separates a deterministic configuration fault from a runtime failure.
 *
 * An occurrence whose AWS account no configured profile can read will fail the
 * same way on every retry, and reporting it as an execution error would hide it
 * among the transient ones. The error carries its own code, so the distinction
 * does not depend on matching words in a message the way
 * `classifyRunbookOutcome` has to for failures that reach it as plain text.
 *
 * @param error - The error raised while executing the occurrence
 * @returns The V1 status to report
 */
function classifyExecutionFailure(error: unknown): 'CONFIG-ERROR' | 'EXECUTION-ERROR' {
  return isAWSTargetNotConfiguredError(error) ? 'CONFIG-ERROR' : 'EXECUTION-ERROR';
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

/**
 * The empty comparison reported when the runbook never produced an output.
 *
 * The reason names the actual cause: a misconfigured AWS target is a run-wide
 * fault to fix once, and calling it an execution error would send whoever reads
 * the report looking for a transient failure.
 *
 * @param hasAnalysis - Whether the occurrence is linked to a Watchtower analysis
 * @param status - The V1 status reported for the failure
 * @returns The comparison row for a runbook that did not run
 */
function failedComparison(hasAnalysis: boolean, status: 'CONFIG-ERROR' | 'EXECUTION-ERROR'): AnalysisMatch {
  return {
    status: hasAnalysis ? 'NO_EVIDENCE' : 'NOT_LINKED',
    confidence: 0,
    reasons: [
      status === 'CONFIG-ERROR'
        ? 'Runbook non eseguito (target AWS non configurato).'
        : 'Runbook non eseguito (errore di esecuzione).',
    ],
    signals: {
      caseIdMentioned: false,
      descriptionOverlap: 0,
      traceIdOverlap: [],
      downstreamOverlap: [],
      errorKeywordOverlap: [],
    },
  };
}
