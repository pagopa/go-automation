import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import type { FlowDirective } from '../../types/FlowDirective.js';

import { findErrorMessage } from '../helpers/findErrorMessage.js';
import { findKnownUrlInLogs } from '../helpers/findKnownUrlInLogs.js';
import { extractFallbackUuid } from '../helpers/extractFallbackUuid.js';
import { findFreshTraceId } from '../helpers/findFreshTraceId.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { KnownUrlsRegistry } from '../registries/KnownUrlsRegistry.js';
import type { ServiceLogsAnalysis } from './ServiceLogsAnalysis.js';

/**
 * Var name that holds the comma-separated list of `(service|identifiers)`
 * tuples already visited by the analysis loop. Shared between
 * {@link analyzeServiceLogs} (which writes the current visit + reads it
 * to detect loops before drilling down) and `decideNext` (which records
 * any final terminal state).
 */
const VISITED_KEYS_VAR = 'apiGwVisitedKeys';

/**
 * Var name that tracks the number of consecutive `trace_id` swaps
 * performed by the analysis loop. Hard-capped to {@link MAX_TRACE_ID_SWAPS}
 * to prevent a pathological chain of swaps.
 */
const TRACE_ID_SWAP_COUNT_VAR = 'apiGwTraceIdSwapCount';

/**
 * Maximum number of consecutive `trace_id` swaps allowed by the
 * analysis loop. Picked high enough to cover realistic scenarios (most
 * traces chain at most 1-2 times) while still guaranteeing termination.
 */
const MAX_TRACE_ID_SWAPS = 5;

/**
 * Configuration for {@link analyzeServiceLogs}.
 */
export interface AnalyzeServiceLogsConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Step id of the CW Logs query whose output to analyse */
  readonly fromStep: string;
  /** Prefix used for the vars written to the runbook context */
  readonly varPrefix: string;
  /** Registry of known URLs against which log messages are scanned */
  readonly registry: KnownUrlsRegistry;
  /**
   * Canonical name of the service being analysed. Required when the
   * step is part of the dynamic API Gateway loop so the routing logic
   * (drill-down via KnownUrl) can record the current visit in the
   * `apiGwVisitedKeys` var. Pre-step / probe usages can omit it.
   */
  readonly serviceName?: string;
  /**
   * Set of microservice names declared by the runbook. When provided
   * **and** {@link serviceName} is also set, the step performs the
   * drill-down decision: if a {@link KnownUrl} whose `target` is in
   * this set is detected and the destination has not been visited yet,
   * the step emits a `goTo query-<target>` flow directive and skips the
   * `'resolve'` signal so the engine does **not** evaluate known cases
   * at this point — drilling down wins over matching a "pointer"-style
   * known case at the upstream layer.
   */
  readonly servicesInRunbook?: ReadonlySet<string>;
  /**
   * Step id prefix used to compose the `goTo` target for a drill-down.
   * Default: `'query-'` (so `goTo` lands on `query-<service>`).
   */
  readonly queryStepPrefix?: string;
  /**
   * When `true`, the step skips every {@link ApiGwReporter} call.
   *
   * Useful for **pre-steps** (e.g. the Lambda authorizer probe in the
   * address-book runbook) that reuse `analyzeServiceLogs` only to set a
   * var for a known case — they live outside the per-service section so
   * their structured output would dangle.
   */
  readonly quiet?: boolean;
}

class AnalyzeServiceLogsStepImpl implements Step<ServiceLogsAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly varPrefix: string;
  private readonly registry: KnownUrlsRegistry;
  private readonly serviceName: string | undefined;
  private readonly servicesInRunbook: ReadonlySet<string> | undefined;
  private readonly queryStepPrefix: string;
  private readonly quiet: boolean;

  constructor(config: AnalyzeServiceLogsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.varPrefix = config.varPrefix;
    this.registry = config.registry;
    this.serviceName = config.serviceName;
    this.servicesInRunbook = config.servicesInRunbook;
    this.queryStepPrefix = config.queryStepPrefix ?? 'query-';
    this.quiet = config.quiet ?? false;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<ServiceLogsAnalysis>> {
    const rawOutput = context.stepResults.get(this.fromStep);
    if (rawOutput === undefined) {
      return { success: false, error: `Step output not found: "${this.fromStep}"` };
    }

    const results = rawOutput as ReadonlyArray<ResultField[]>;
    const reporter = !this.quiet && context.logger !== undefined ? new ApiGwReporter(context.logger) : undefined;

    // Common identifiers (only used by the routing branch).
    const xRayTraceId = (context.vars.get('xRayTraceId') ?? '').trim();
    const fallbackUuidExisting = (context.vars.get('fallbackUuid') ?? '').trim();

    if (results.length === 0) {
      reporter?.analysisFindings({ errorMessageLen: 0 });
      return {
        success: true,
        output: {
          errorMessage: '',
          logCount: 0,
          knownUrl: undefined,
          knownUrlTarget: undefined,
          fallbackUuidExtracted: undefined,
        },
        vars: {
          [`${this.varPrefix}ErrorMsg`]: '',
          [`${this.varPrefix}LogCount`]: '0',
          [`${this.varPrefix}NextUrl`]: '',
          [`${this.varPrefix}NextUrlTarget`]: '',
          [`${this.varPrefix}FallbackUuidFresh`]: 'false',
        },
        // Empty result set is still a signal: cases that match on
        // absence (e.g. `<prefix>LogCount == '0'`) get their chance.
        next: 'resolve' as const,
      };
    }

    const errorMessage = findErrorMessage(results);
    const knownUrl = findKnownUrlInLogs(results, this.registry);

    const extractedFallback = extractFallbackUuid(results);
    const fallbackIsFresh = extractedFallback !== undefined && extractedFallback !== fallbackUuidExisting;

    const vars: Record<string, string> = {
      [`${this.varPrefix}ErrorMsg`]: errorMessage,
      [`${this.varPrefix}LogCount`]: String(results.length),
      [`${this.varPrefix}NextUrl`]: knownUrl?.observedUrl ?? '',
      [`${this.varPrefix}NextUrlTarget`]: knownUrl?.known.target ?? '',
      [`${this.varPrefix}FallbackUuidFresh`]: fallbackIsFresh ? 'true' : 'false',
    };

    if (fallbackIsFresh && extractedFallback !== undefined) {
      vars['fallbackUuid'] = extractedFallback;
    }

    reporter?.analysisFindings({
      errorMessageLen: errorMessage.length,
      ...(knownUrl !== undefined
        ? { knownUrl: { observedUrl: knownUrl.observedUrl, target: knownUrl.known.target } }
        : {}),
      ...(fallbackIsFresh && extractedFallback !== undefined ? { fallbackUuid: extractedFallback } : {}),
    });

    // Drill-down decision: only when this step is wired into the main
    // dynamic loop (serviceName + servicesInRunbook supplied) AND a
    // KnownUrl in scope was found AND we would not be looping.
    if (
      this.serviceName !== undefined &&
      this.servicesInRunbook !== undefined &&
      knownUrl !== undefined &&
      this.servicesInRunbook.has(knownUrl.known.target)
    ) {
      const fallbackForKey =
        fallbackIsFresh && extractedFallback !== undefined ? extractedFallback : fallbackUuidExisting;
      const visited = parseVisitedKeys(context.vars.get(VISITED_KEYS_VAR));
      const currentKey = buildKey(this.serviceName, xRayTraceId, fallbackForKey);
      const destKey = buildKey(knownUrl.known.target, xRayTraceId, fallbackForKey);
      const nextVisited = new Set(visited);
      nextVisited.add(currentKey);

      if (!visited.has(destKey)) {
        reporter?.decisionGoToService(knownUrl.known.target);
        return {
          success: true,
          output: {
            errorMessage,
            logCount: results.length,
            knownUrl: knownUrl.observedUrl,
            knownUrlTarget: knownUrl.known.target,
            fallbackUuidExtracted: fallbackIsFresh ? extractedFallback : undefined,
          },
          vars: {
            ...vars,
            [VISITED_KEYS_VAR]: serializeVisitedKeys(nextVisited),
          },
          // Drill down — bypass known-case eval at this service so a
          // pointer-style case (e.g. "vai a guardare ext-registry-...")
          // does not prevent the more specific evidence from the
          // downstream service.
          next: { goTo: `${this.queryStepPrefix}${knownUrl.known.target}` } satisfies FlowDirective,
        };
      }
      // Loop guard: dest already visited with the same identifiers.
      // Fall through to the standard 'resolve' branch so known cases
      // get a chance; `decideNext` will then stop with `loop-detected`
      // if no case matches.
    }

    // trace_id swap decision: only when this step is wired into the
    // main dynamic loop AND the previous query already used a
    // FALLBACK-UUID (i.e. `fallbackUuid` was already set when the query
    // ran). The application logs may carry an alternative `trace_id`
    // that should become the canonical X-Ray trace id for a follow-up
    // query on the same service.
    if (this.serviceName !== undefined && fallbackUuidExisting !== '') {
      const rawSwapCount = Number(context.vars.get(TRACE_ID_SWAP_COUNT_VAR) ?? '0');
      const swapCount = Number.isFinite(rawSwapCount) ? rawSwapCount : 0;
      if (swapCount < MAX_TRACE_ID_SWAPS) {
        const known = new Set<string>();
        if (xRayTraceId !== '') known.add(xRayTraceId);
        if (fallbackUuidExisting !== '') known.add(fallbackUuidExisting);
        const freshTrace = findFreshTraceId(results, known);
        if (freshTrace !== undefined) {
          const visited = parseVisitedKeys(context.vars.get(VISITED_KEYS_VAR));
          const currentKey = buildKey(this.serviceName, xRayTraceId, fallbackUuidExisting);
          const destKey = buildKey(this.serviceName, freshTrace.canonical, fallbackUuidExisting);

          if (!visited.has(destKey)) {
            const nextVisited = new Set(visited);
            nextVisited.add(currentKey);

            reporter?.decisionTraceIdSwap(this.serviceName, freshTrace.raw, freshTrace.canonical);

            return {
              success: true,
              output: {
                errorMessage,
                logCount: results.length,
                knownUrl: knownUrl?.observedUrl,
                knownUrlTarget: knownUrl?.known.target,
                fallbackUuidExtracted: fallbackIsFresh ? extractedFallback : undefined,
              },
              vars: {
                ...vars,
                xRayTraceId: freshTrace.canonical,
                [`${this.varPrefix}SwappedTraceId`]: freshTrace.canonical,
                [`${this.varPrefix}SwappedTraceIdRaw`]: freshTrace.raw,
                [TRACE_ID_SWAP_COUNT_VAR]: String(swapCount + 1),
                [VISITED_KEYS_VAR]: serializeVisitedKeys(nextVisited),
                ...(context.vars.get('apiGwOriginalTraceId') === undefined
                  ? { apiGwOriginalTraceId: xRayTraceId }
                  : {}),
              },
              next: { goTo: `${this.queryStepPrefix}${this.serviceName}` } satisfies FlowDirective,
            };
          }
          // Else: the swap destination is already visited. Fall through
          // to the standard 'resolve' branch; `decideNext` will close
          // the analysis as `no-match` (or `loop-detected` if applicable).
        }
      }
    }

    return {
      success: true,
      output: {
        errorMessage,
        logCount: results.length,
        knownUrl: knownUrl?.observedUrl,
        knownUrlTarget: knownUrl?.known.target,
        fallbackUuidExtracted: fallbackIsFresh ? extractedFallback : undefined,
      },
      vars,
      // Default branch: signal known-case resolution. Even cases that
      // match on absence (e.g. `<prefix>LogCount == '0'`) need their
      // chance before `decide-<service>` declares the search closed.
      next: 'resolve' as const,
    };
  }
}

function buildKey(service: string, xRayTraceId: string, fallbackUuid: string): string {
  return `${service}|${xRayTraceId}|${fallbackUuid}`;
}

function parseVisitedKeys(raw: string | undefined): ReadonlySet<string> {
  if (raw === undefined || raw.trim() === '') return new Set();
  return new Set(raw.split('\n').filter((s) => s !== ''));
}

function serializeVisitedKeys(set: ReadonlySet<string>): string {
  return [...set].join('\n');
}

/**
 * Factory: creates a step that analyses microservice CloudWatch Logs query
 * results.
 *
 * The step:
 * - extracts the most representative error message from the rows
 *   (see {@link findErrorMessage});
 * - scans the rows for the first URL matching the
 *   {@link KnownUrlsRegistry} (see {@link findKnownUrlInLogs});
 * - extracts any new `FALLBACK-UUID` token (compared with the value
 *   already present in `fallbackUuid`);
 * - **drills down via the KnownUrl when in scope**: if {@link serviceName}
 *   and {@link servicesInRunbook} are supplied and the observed URL's
 *   target is one of the runbook services (and the destination has not
 *   been visited yet with the same identifiers), the step emits a
 *   `goTo query-<target>` flow directive instead of `'resolve'`. This
 *   ensures pointer-style known cases at the upstream layer cannot
 *   pre-empt the more specific evidence available downstream.
 *
 * When no drill-down applies the step signals `next: 'resolve'` so the
 * engine evaluates known cases (including cases that match on absence
 * such as `<prefix>LogCount == '0'`). If no case matches the engine
 * proceeds to `decide-<service>` for the remaining branches (external
 * downstream, fallback retry, terminal no-match, loop-detected).
 *
 * Vars written:
 * - `<varPrefix>ErrorMsg`: longest error message (empty when none)
 * - `<varPrefix>LogCount`: number of result rows
 * - `<varPrefix>NextUrl`: observed URL matched by the registry (empty when none)
 * - `<varPrefix>NextUrlTarget`: target name of the matched URL (empty when none)
 * - `<varPrefix>FallbackUuidFresh`: `"true"` iff a new fallback UUID was
 *   extracted during this analysis call
 * - `fallbackUuid`: updated only when a new value is extracted (sticky otherwise)
 * - `apiGwVisitedKeys`: updated with the current `(service|trace|fallback)`
 *   key on the drill-down branch (so `decide-<service>` can detect loops)
 *
 * @param config - Step configuration
 * @returns Step that produces a {@link ServiceLogsAnalysis}
 */
export function analyzeServiceLogs(config: AnalyzeServiceLogsConfig): Step<ServiceLogsAnalysis> {
  return new AnalyzeServiceLogsStepImpl(config);
}
