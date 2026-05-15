import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';

import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import type { TimeRangeFromParams } from '../../steps/data/CloudWatchLogsQueryStep.js';
import { resolveTimeRange } from '../../steps/data/resolveTimeRange.js';
import { executeStep } from '../../steps/data/executeStep.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { ServiceLogSpec } from '../profiles/specs/ServiceLogSpec.js';
import { SEND_API_GW_PROFILE } from '../profiles/SEND_API_GW_PROFILE.js';
import { renderQueryTemplate } from '../profiles/render/renderQueryTemplate.js';

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
   * Nome della var di contesto da cui leggere il trace id. Default
   * letto da `accessLogSchemaTraceIdContextVar`, altrimenti `'xRayTraceId'`.
   */
  readonly xRayTraceIdVar?: string;
  /**
   * Name of the var holding the fallback UUID. Default: `fallbackUuid`.
   */
  readonly fallbackUuidVar?: string;
  /** Mapping for the time-range parameters in the runbook context. */
  readonly timeRangeFromParams: TimeRangeFromParams;
  /**
   * Specification dei log applicativi del prodotto (query template +
   * predicate per trace/fallback + schema). Quando omessa, viene usata la
   * spec SEND di default per back-compat.
   */
  readonly spec?: ServiceLogSpec;
  /**
   * Identificatore del profilo per i metadati di trace. Default `'send'`.
   */
  readonly queryProfileId?: string;
  /**
   * Override puntuale del template di query a livello di singolo
   * servizio. Deve contenere `{{FILTER_CLAUSE}}`. Sostituisce SOLO
   * `spec.queryTemplate`: i predicate template restano quelli del profilo.
   */
  readonly queryTemplateOverride?: string;
  /**
   * Nome della var di contesto in cui scrivere il trace id quando viene
   * letto dal config. Letto dall'accessLog schema del profilo nella
   * factory `createApiGwAlarmRunbook`. Default `'xRayTraceId'` per
   * back-compat SEND.
   */
  readonly accessLogSchemaTraceIdContextVar?: string;
}

type IdentifierKind = 'trace' | 'fallback';

interface ActiveIdentifier {
  readonly kind: IdentifierKind;
  readonly value: string;
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
  private readonly spec: ServiceLogSpec;
  private readonly queryProfileId: string;
  private readonly queryTemplate: string;

  constructor(config: QueryServiceLogsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.serviceName = config.serviceName;
    this.entryService = config.entryService;
    this.logGroups = config.logGroups;
    this.spec = config.spec ?? SEND_API_GW_PROFILE.serviceLog;
    this.queryProfileId = config.queryProfileId ?? SEND_API_GW_PROFILE.id;
    this.xRayTraceIdVar = config.xRayTraceIdVar ?? config.accessLogSchemaTraceIdContextVar ?? 'xRayTraceId';
    this.fallbackUuidVar = config.fallbackUuidVar ?? 'fallbackUuid';
    this.timeRangeFromParams = config.timeRangeFromParams;
    this.queryTemplate = config.queryTemplateOverride ?? this.spec.queryTemplate;

    // Fail fast quando il template è privo del placeholder: un silent
    // no-op `.split().join()` produrrebbe una query senza filter clause,
    // scansionando l'intero log group ad ogni visita.
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
    const activeIdentifier = this.resolveActiveIdentifier(traceId, fallback);

    return {
      queryProfileId: this.queryProfileId,
      queryKind: 'service-log',
      identifierMode: activeIdentifier?.kind ?? 'none',
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

      // Always bump the query counter.
      const prevCount = Number(context.vars.get(QUERY_COUNTER_VAR) ?? '0');
      const queryNumber = Number.isFinite(prevCount) ? prevCount + 1 : 1;

      const lastService = context.vars.get(LAST_SERVICE_VAR) ?? '';
      const isNewVisit = lastService !== this.serviceName;
      const prevVisits = Number(context.vars.get(VISIT_COUNTER_VAR) ?? '0');
      const safeVisits = Number.isFinite(prevVisits) ? prevVisits : 0;
      const visitNumber = isNewVisit ? safeVisits + 1 : safeVisits;

      const reporter = context.logger !== undefined ? new ApiGwReporter(context.logger) : undefined;
      if (isNewVisit) {
        reporter?.sectionService(visitNumber, this.serviceName, this.entryService, this.logGroups);
      }

      const activeIdentifier = this.resolveActiveIdentifier(traceId, fallback);
      const identifiers =
        activeIdentifier === undefined
          ? []
          : [`${activeIdentifier.kind === 'fallback' ? 'fallbackUuid' : 'xRayTraceId'}=${activeIdentifier.value}`];
      reporter?.query(queryNumber, identifiers);

      if (activeIdentifier === undefined) {
        // Senza identificatori la filter clause sarebbe vuota: skip la
        // chiamata AWS e restituisce risultato vuoto così l'analisi
        // downstream prosegue in sicurezza.
        reporter?.queryResult(0);
        return {
          success: true,
          output: [],
          vars: {
            [QUERY_COUNTER_VAR]: String(queryNumber),
            [VISIT_COUNTER_VAR]: String(visitNumber),
            [LAST_SERVICE_VAR]: this.serviceName,
            apiGwCurrentQueryIdentifierMode: 'none',
            apiGwCurrentQueryIdentifierValue: '',
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
          apiGwCurrentQueryIdentifierMode: activeIdentifier.kind,
          apiGwCurrentQueryIdentifierValue: activeIdentifier.value,
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
   * Assembla la `filter` clause e la inietta nel template della query.
   *
   * V04: i predicate sono ora letti dalla spec del profilo
   * (`tracePredicateTemplate` / `fallbackPredicateTemplate`), che permette
   * a INTEROP di filtrare su campi strutturati invece di `@message like`.
   */
  private buildQuery(traceId: string, fallback: string): string {
    const activeIdentifier = this.resolveActiveIdentifier(traceId, fallback);
    let filterClause = '';
    if (activeIdentifier !== undefined) {
      const predicateTemplate =
        activeIdentifier.kind === 'fallback' ? this.spec.fallbackPredicateTemplate : this.spec.tracePredicateTemplate;
      const predicate = renderQueryTemplate(predicateTemplate, {
        values: { '{{VALUE}}': activeIdentifier.value },
        escape: 'sql',
        queryId: `${this.queryProfileId}.serviceLog.${activeIdentifier.kind}Predicate`,
      });
      filterClause = `filter ${predicate}`;
    }

    return renderQueryTemplate(this.queryTemplate, {
      values: { '{{FILTER_CLAUSE}}': filterClause },
      escape: 'none',
      queryId: `${this.queryProfileId}.serviceLog`,
    });
  }

  private resolveActiveIdentifier(traceId: string, fallback: string): ActiveIdentifier | undefined {
    const trimmedFallback = fallback.trim();
    if (trimmedFallback !== '') {
      return { kind: 'fallback', value: trimmedFallback };
    }

    const trimmedTrace = traceId.trim();
    if (trimmedTrace !== '') {
      return { kind: 'trace', value: trimmedTrace };
    }

    return undefined;
  }
}

/**
 * Maintains the comma-separated `name|count` chain stored in the
 * `apiGwServicesVisited` var. The reporter parses this var on
 * termination to render the closing summary.
 */
function updateChain(previous: string | undefined, serviceName: string, logCount: number, isNewVisit: boolean): string {
  if (previous === undefined || previous === '') {
    return `${serviceName}|${logCount}`;
  }
  if (isNewVisit) {
    return `${previous},${serviceName}|${logCount}`;
  }
  const entries = previous.split(',');
  entries[entries.length - 1] = `${serviceName}|${logCount}`;
  return entries.join(',');
}

/**
 * Factory: creates a step that queries a microservice log group filtering
 * by trace id or fallback UUID, assembled dynamically from the runbook
 * context using the predicate template of the provided profile.
 *
 * V04: i predicate sono parametrizzati dal profilo
 * (`spec.tracePredicateTemplate` / `spec.fallbackPredicateTemplate`),
 * permettendo a prodotti diversi di filtrare su campi strutturati
 * (es. INTEROP `trace_id = '<value>'`) invece di `@message like '<value>'`.
 *
 * @param config - Step configuration
 * @returns Step that returns the raw rows of the CloudWatch Logs query
 */
export function queryServiceLogs(config: QueryServiceLogsConfig): Step<ReadonlyArray<ReadonlyArray<ResultField>>> {
  return new QueryServiceLogsStepImpl(config);
}
