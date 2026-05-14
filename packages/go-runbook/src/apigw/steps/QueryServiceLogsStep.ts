import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';

import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import type { TimeRangeFromParams } from '../../steps/data/CloudWatchLogsQueryStep.js';
import { resolveTimeRange } from '../../steps/data/resolveTimeRange.js';
import { escapeSqlString } from '../../steps/data/interpolateTemplate.js';
import { executeStep } from '../../steps/data/executeStep.js';
import { DEFAULT_SERVICE_QUERY_TEMPLATE } from '../queries/DEFAULT_SERVICE_QUERY_TEMPLATE.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';

const FILTER_CLAUSE_PLACEHOLDER = '{{FILTER_CLAUSE}}';

/**
 * Counter var name used to track CloudWatch query attempts across the
 * whole runbook execution. Written/read by {@link queryServiceLogs};
 * displayed by the reporter so users see "Query CloudWatch N" hops.
 */
const QUERY_COUNTER_VAR = 'apiGwQueryCount';

/**
 * Counter var name used to track **distinct** service visits. A
 * re-query on the same service (fallback-UUID retry, trace_id swap)
 * does **not** increment this counter — only an actual transition to a
 * different service does. Used by the reporter to number the
 * `═══ Servizio N ═══` banners.
 */
const VISIT_COUNTER_VAR = 'apiGwVisitCount';

/**
 * Name of the last service entered, persisted to detect whether the
 * current execution is a new visit or a re-query of the same service.
 */
const LAST_SERVICE_VAR = 'apiGwLastService';

/**
 * Configuration for {@link queryServiceLogs}.
 */
export interface QueryServiceLogsConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label */
  readonly label: string;
  /** Canonical name of the service being queried (used by the reporter) */
  readonly serviceName: string;
  /** Whether this service is the entry point of the analysis */
  readonly entryService: boolean;
  /** Log groups to scan */
  readonly logGroups: ReadonlyArray<string>;
  /**
   * Name of the var holding the X-Ray trace id. Default: `xRayTraceId`.
   */
  readonly xRayTraceIdVar?: string;
  /**
   * Name of the var holding the fallback UUID. Default: `fallbackUuid`.
   */
  readonly fallbackUuidVar?: string;
  /**
   * Mapping for the time-range parameters in the runbook context.
   */
  readonly timeRangeFromParams: TimeRangeFromParams;
  /**
   * Query template. Must contain the `{{FILTER_CLAUSE}}` placeholder.
   * Default: {@link DEFAULT_SERVICE_QUERY_TEMPLATE}.
   */
  readonly queryTemplate?: string;
}

class QueryServiceLogsStepImpl implements Step<ReadonlyArray<ReadonlyArray<ResultField>>> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'data';

  private readonly serviceName: string;
  private readonly entryService: boolean;
  private readonly logGroups: ReadonlyArray<string>;
  private readonly xRayTraceIdVar: string;
  private readonly fallbackUuidVar: string;
  private readonly timeRangeFromParams: TimeRangeFromParams;
  private readonly queryTemplate: string;

  constructor(config: QueryServiceLogsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.serviceName = config.serviceName;
    this.entryService = config.entryService;
    this.logGroups = config.logGroups;
    this.xRayTraceIdVar = config.xRayTraceIdVar ?? 'xRayTraceId';
    this.fallbackUuidVar = config.fallbackUuidVar ?? 'fallbackUuid';
    this.timeRangeFromParams = config.timeRangeFromParams;
    this.queryTemplate = config.queryTemplate ?? DEFAULT_SERVICE_QUERY_TEMPLATE;

    // Fail fast when the template is missing the placeholder: a silent
    // no-op `.split().join()` would otherwise produce a query without
    // any `filter` clause, scanning the entire log group on each visit.
    if (!this.queryTemplate.includes(FILTER_CLAUSE_PLACEHOLDER)) {
      throw new Error(
        `QueryServiceLogsStep "${this.id}": queryTemplate must contain the ` +
          `${FILTER_CLAUSE_PLACEHOLDER} placeholder; without it the filter ` +
          `clause cannot be injected and the query would scan the whole log group.`,
      );
    }
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    const traceId = context.vars.get(this.xRayTraceIdVar) ?? '';
    const fallback = context.vars.get(this.fallbackUuidVar) ?? '';
    const startStr = context.params.get(this.timeRangeFromParams.start);
    const endStr = context.params.get(this.timeRangeFromParams.end);

    return {
      query: this.buildQuery(traceId, fallback),
      logGroups: [...this.logGroups],
      identifiers: { xRayTraceId: traceId, fallbackUuid: fallback },
      timeRange: { start: startStr ?? null, end: endStr ?? null },
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<ReadonlyArray<ReadonlyArray<ResultField>>>> {
    return executeStep('CloudWatch service logs query', async () => {
      const traceId = (context.vars.get(this.xRayTraceIdVar) ?? '').trim();
      const fallback = (context.vars.get(this.fallbackUuidVar) ?? '').trim();

      // Always bump the query counter: it tracks every CloudWatch
      // attempt, including re-queries on the same service (fallback-UUID
      // retry, trace_id swap).
      const prevCount = Number(context.vars.get(QUERY_COUNTER_VAR) ?? '0');
      const queryNumber = Number.isFinite(prevCount) ? prevCount + 1 : 1;

      // Service-visit counter increments only when we enter a NEW
      // service — a re-query on the same service is just another
      // attempt within the current visit (no new banner).
      const lastService = context.vars.get(LAST_SERVICE_VAR) ?? '';
      const isNewVisit = lastService !== this.serviceName;
      const prevVisits = Number(context.vars.get(VISIT_COUNTER_VAR) ?? '0');
      const safeVisits = Number.isFinite(prevVisits) ? prevVisits : 0;
      const visitNumber = isNewVisit ? safeVisits + 1 : safeVisits;

      const reporter = context.logger !== undefined ? new ApiGwReporter(context.logger) : undefined;
      if (isNewVisit) {
        reporter?.sectionService(visitNumber, this.serviceName, this.entryService, this.logGroups);
      }

      const identifiers: string[] = [];
      if (traceId !== '') identifiers.push(`xRayTraceId=${traceId}`);
      if (fallback !== '') identifiers.push(`fallbackUuid=${fallback}`);
      reporter?.query(queryNumber, identifiers);

      if (traceId === '' && fallback === '') {
        // Without any identifier the canonical `like` filter would
        // degenerate to a match-all. Skip the AWS call and return an
        // empty result set so downstream analysis can proceed safely.
        reporter?.queryResult(0);
        return {
          success: true,
          output: [],
          vars: {
            [QUERY_COUNTER_VAR]: String(queryNumber),
            [VISIT_COUNTER_VAR]: String(visitNumber),
            [LAST_SERVICE_VAR]: this.serviceName,
            apiGwServicesVisited: updateChain(
              context.vars.get('apiGwServicesVisited'),
              this.serviceName,
              0,
              isNewVisit,
            ),
          },
        };
      }

      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const query = this.buildQuery(traceId, fallback);

      let results: ReadonlyArray<ReadonlyArray<ResultField>>;
      try {
        results = await context.services.cloudWatchLogs.query(this.logGroups, query, timeRange, {
          ...(context.signal !== undefined ? { signal: context.signal } : {}),
          logGroupResolutionMode: 'search-configured-profiles',
        });
      } catch (error: unknown) {
        // Surface the AWS failure in the structured log so it does not
        // get buried in the engine's per-step error noise (e.g. a
        // ResourceNotFoundException on a misconfigured log group is
        // otherwise invisible until the trace is inspected). Re-throw
        // so `executeStep` converts it to `{ success: false, error }`
        // and the engine fan-out (continueOnFailure / decide / final
        // case match) keeps working as before.
        const message = error instanceof Error ? error.message : String(error);
        reporter?.queryFailed(this.logGroups, message);
        throw error;
      }

      reporter?.queryResult(results.length);

      return {
        success: true,
        output: results,
        vars: {
          [QUERY_COUNTER_VAR]: String(queryNumber),
          [VISIT_COUNTER_VAR]: String(visitNumber),
          [LAST_SERVICE_VAR]: this.serviceName,
          apiGwServicesVisited: updateChain(
            context.vars.get('apiGwServicesVisited'),
            this.serviceName,
            results.length,
            isNewVisit,
          ),
        },
      };
    });
  }

  /**
   * Assembles the `filter` clause and injects it into the query template.
   *
   * Each identifier becomes a `@message like '...'` predicate, escaped via
   * {@link escapeSqlString}; the predicates are joined with `or`.
   */
  private buildQuery(traceId: string, fallback: string): string {
    const clauses: string[] = [];
    const trimmedTrace = traceId.trim();
    const trimmedFallback = fallback.trim();

    if (trimmedTrace !== '') {
      clauses.push(`@message like '${escapeSqlString(trimmedTrace)}'`);
    }
    if (trimmedFallback !== '') {
      clauses.push(`@message like '${escapeSqlString(trimmedFallback)}'`);
    }

    const filterClause = clauses.length === 0 ? '' : `filter ${clauses.join(' or ')}`;
    return this.queryTemplate.split(FILTER_CLAUSE_PLACEHOLDER).join(filterClause);
  }
}

/**
 * Maintains the comma-separated `name|count` chain stored in the
 * `apiGwServicesVisited` var. The reporter parses this var on
 * termination to render the closing summary.
 *
 * - On a **new visit** (`isNewVisit = true`) a new `name|count` entry
 *   is appended.
 * - On a **re-query** of the same service (`isNewVisit = false`) the
 *   last entry's count is overwritten with the latest value so the
 *   summary always reflects the most recent row count for each
 *   distinct visit.
 *
 * @param previous - Current value of the var (may be undefined/empty)
 * @param serviceName - Service just queried
 * @param logCount - Number of log rows returned by the latest query
 * @param isNewVisit - Whether this is a new service visit or a re-query
 * @returns Updated chain string
 */
function updateChain(previous: string | undefined, serviceName: string, logCount: number, isNewVisit: boolean): string {
  if (previous === undefined || previous === '') {
    return `${serviceName}|${logCount}`;
  }
  if (isNewVisit) {
    return `${previous},${serviceName}|${logCount}`;
  }
  // Re-query on the same service: overwrite the last entry's count.
  const entries = previous.split(',');
  entries[entries.length - 1] = `${serviceName}|${logCount}`;
  return entries.join(',');
}

/**
 * Factory: creates a step that queries a microservice log group filtering
 * by X-Ray trace id and/or fallback UUID, assembled dynamically from the
 * runbook context.
 *
 * Behavioural contract:
 * - if both identifiers are missing/empty the step returns an empty
 *   result set without contacting CloudWatch Logs;
 * - identifiers found in `context.vars` are quoted and escaped (single
 *   quote doubling) before being placed in the `like '...'` predicates;
 * - the produced query carries no time-range filter — the window is
 *   passed via `StartQueryCommand.startTime` / `endTime`;
 * - each execution bumps the global `apiGwQueryCount` and `apiGwVisitCount`
 *   counters so the reporter can render a stable progressive index.
 *
 * @param config - Step configuration
 * @returns Step that returns the raw rows of the CloudWatch Logs query
 */
export function queryServiceLogs(config: QueryServiceLogsConfig): Step<ReadonlyArray<ReadonlyArray<ResultField>>> {
  return new QueryServiceLogsStepImpl(config);
}
