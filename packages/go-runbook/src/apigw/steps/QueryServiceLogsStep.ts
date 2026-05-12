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

      // Bump the global query counter so the reporter can show a stable
      // "Query CloudWatch N" index that increases monotonically across
      // every service visit (including re-queries with fallback UUID).
      const prevCount = Number(context.vars.get(QUERY_COUNTER_VAR) ?? '0');
      const queryNumber = Number.isFinite(prevCount) ? prevCount + 1 : 1;

      // Service visit counter (independent from query counter: increments
      // once per distinct visit, not per re-query).
      const prevVisits = Number(context.vars.get('apiGwVisitCount') ?? '0');
      const visitNumber = Number.isFinite(prevVisits) ? prevVisits + 1 : 1;

      const reporter = context.logger !== undefined ? new ApiGwReporter(context.logger) : undefined;
      reporter?.sectionService(visitNumber, this.serviceName, this.entryService, this.logGroups);

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
            apiGwVisitCount: String(visitNumber),
            apiGwServicesVisited: appendChain(context.vars.get('apiGwServicesVisited'), this.serviceName, 0),
          },
        };
      }

      const timeRange = resolveTimeRange(context, this.timeRangeFromParams);
      const query = this.buildQuery(traceId, fallback);

      const results = await context.services.cloudWatchLogs.query(this.logGroups, query, timeRange, {
        ...(context.signal !== undefined ? { signal: context.signal } : {}),
      });

      reporter?.queryResult(results.length);

      return {
        success: true,
        output: results,
        vars: {
          [QUERY_COUNTER_VAR]: String(queryNumber),
          apiGwVisitCount: String(visitNumber),
          apiGwServicesVisited: appendChain(context.vars.get('apiGwServicesVisited'), this.serviceName, results.length),
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
 * Appends a `name|count` entry to the comma-separated chain stored in
 * the `apiGwServicesVisited` var. The reporter parses this var on
 * termination to render the closing summary.
 *
 * @param previous - Current value of the var (may be undefined/empty)
 * @param serviceName - Service just visited
 * @param logCount - Number of log rows returned by the visit
 * @returns Updated chain string
 */
function appendChain(previous: string | undefined, serviceName: string, logCount: number): string {
  const head = previous === undefined || previous === '' ? '' : `${previous},`;
  return `${head}${serviceName}|${logCount}`;
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
