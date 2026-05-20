import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import type { FlowDirective } from '../../types/FlowDirective.js';

import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { TerminationReason } from '../types/TerminationReason.js';

/**
 * Var name that holds the comma-separated list of `(service|identifiers)`
 * tuples already visited by the analysis loop. Updated by every
 * {@link decideNext} invocation to short-circuit cycles.
 */
const VISITED_KEYS_VAR = 'apiGwVisitedKeys';

/**
 * Var name that tracks the number of consecutive `trace_id` swaps
 * performed by the analysis loop. Hard-capped to prevent pathological
 * fallback traces from bouncing forever.
 */
const TRACE_ID_SWAP_COUNT_VAR = 'apiGwTraceIdSwapCount';

const MAX_TRACE_ID_SWAPS = 5;

/**
 * Configuration for {@link decideNext}.
 */
export interface DecideNextConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label */
  readonly label: string;
  /** Service name this step decides for (used to build the visited key) */
  readonly serviceName: string;
  /** Var prefix of the current service (used to read analyse outputs) */
  readonly varPrefix: string;
  /**
   * Set of microservice names declared by the runbook. A {@link KnownUrl}
   * whose `target` is in this set causes the loop to enter that service;
   * everything else terminates as "external downstream".
   */
  readonly servicesInRunbook: ReadonlySet<string>;
  /**
   * Step id prefix used to compose the `goTo` target for a service jump.
   * Default: `'query-'` (so `goTo` lands on `query-<service>`).
   */
  readonly queryStepPrefix?: string;
  /**
   * Name of the context var holding the trace id of the current analysis.
   * Default `'xRayTraceId'` (SEND). Profili non-SEND (es. INTEROP che usa
   * `cid` → `traceId`) devono passare il nome corretto qui, altrimenti la
   * loop guard non vede mai il valore reale e i `(service, identifiers)`
   * visit key collassano.
   */
  readonly traceIdContextVar?: string;
}

/** Output payload produced by {@link decideNext}. */
export interface DecideNextOutput {
  readonly decision:
    | { readonly kind: 'goto-service'; readonly target: string }
    | { readonly kind: 'trace-id-swap'; readonly target: string }
    | { readonly kind: 'stop'; readonly reason: TerminationReason; readonly downstreamTarget?: string };
}

class DecideNextStepImpl implements Step<DecideNextOutput> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  private readonly serviceName: string;
  private readonly varPrefix: string;
  private readonly servicesInRunbook: ReadonlySet<string>;
  private readonly queryStepPrefix: string;
  private readonly traceIdContextVar: string;

  constructor(config: DecideNextConfig) {
    this.id = config.id;
    this.label = config.label;
    this.serviceName = config.serviceName;
    this.varPrefix = config.varPrefix;
    this.servicesInRunbook = config.servicesInRunbook;
    this.queryStepPrefix = config.queryStepPrefix ?? 'query-';
    this.traceIdContextVar = config.traceIdContextVar ?? 'xRayTraceId';
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<DecideNextOutput>> {
    const nextUrlTarget = (context.vars.get(`${this.varPrefix}NextUrlTarget`) ?? '').trim();
    const freshTraceId = (context.vars.get(`${this.varPrefix}FreshTraceId`) ?? '').trim();
    const freshTraceIdRaw = (context.vars.get(`${this.varPrefix}FreshTraceIdRaw`) ?? '').trim();

    const traceId = (context.vars.get(this.traceIdContextVar) ?? '').trim();
    const fallbackUuid = (context.vars.get('fallbackUuid') ?? '').trim();

    const visited = parseVisitedKeys(context.vars.get(VISITED_KEYS_VAR));
    const reporter = context.logger !== undefined ? new ApiGwReporter(context.logger) : undefined;

    const currentKey = buildKey(this.serviceName, traceId, fallbackUuid);
    const nextVisited = new Set(visited);
    nextVisited.add(currentKey);

    // 1) A fallback-UUID query found a concrete trace_id in the service
    // logs. Re-run the same service immediately with ONLY that trace id:
    // fallbackUuid is cleared so QueryServiceLogsStep does not keep using it.
    if (freshTraceId !== '') {
      const rawSwapCount = Number(context.vars.get(TRACE_ID_SWAP_COUNT_VAR) ?? '0');
      const swapCount = Number.isFinite(rawSwapCount) ? rawSwapCount : 0;
      if (swapCount >= MAX_TRACE_ID_SWAPS) {
        reporter?.decisionLoopDetected(this.serviceName);
        return this.stopResult('loop-detected', nextVisited, reporter, context);
      }

      const destKey = buildKey(this.serviceName, freshTraceId, '');
      if (visited.has(destKey)) {
        reporter?.decisionLoopDetected(this.serviceName);
        return this.stopResult('loop-detected', nextVisited, reporter, context);
      }

      reporter?.decisionTraceIdSwap(this.serviceName, freshTraceIdRaw || freshTraceId, freshTraceId);
      return {
        success: true,
        output: { decision: { kind: 'trace-id-swap', target: this.serviceName } },
        vars: {
          [VISITED_KEYS_VAR]: serializeVisitedKeys(nextVisited),
          [this.traceIdContextVar]: freshTraceId,
          fallbackUuid: '',
          [`${this.varPrefix}FallbackUuidFresh`]: 'false',
          [`${this.varPrefix}SwappedTraceId`]: freshTraceId,
          [`${this.varPrefix}SwappedTraceIdRaw`]: freshTraceIdRaw || freshTraceId,
          [TRACE_ID_SWAP_COUNT_VAR]: String(swapCount + 1),
          ...(context.vars.get('apiGwOriginalTraceId') === undefined ? { apiGwOriginalTraceId: traceId } : {}),
          terminationReason: '',
        },
        next: { goTo: `${this.queryStepPrefix}${this.serviceName}` } satisfies FlowDirective,
      };
    }

    // A KnownUrl pointing back to the current service is not useful
    // drill-down evidence: following it would re-run the same query
    // with the same identifiers forever.
    if (nextUrlTarget === this.serviceName) {
      reporter?.decisionLoopDetected(nextUrlTarget);
      return this.stopResult('loop-detected', nextVisited, reporter, context);
    }

    // 2) Known URL pointing to a microservice in scope → loop into it.
    if (nextUrlTarget !== '' && this.servicesInRunbook.has(nextUrlTarget)) {
      const destKey = buildKey(nextUrlTarget, traceId, fallbackUuid);
      if (visited.has(destKey)) {
        reporter?.decisionLoopDetected(nextUrlTarget);
        return this.stopResult('loop-detected', nextVisited, reporter, context);
      }
      reporter?.decisionGoToService(nextUrlTarget);
      return {
        success: true,
        output: { decision: { kind: 'goto-service', target: nextUrlTarget } },
        vars: {
          [VISITED_KEYS_VAR]: serializeVisitedKeys(nextVisited),
          terminationReason: '',
        },
        next: { goTo: `${this.queryStepPrefix}${nextUrlTarget}` } satisfies FlowDirective,
      };
    }

    // 3) Known URL pointing outside the runbook scope → terminate.
    if (nextUrlTarget !== '') {
      reporter?.decisionExternalDownstream(nextUrlTarget);
      return this.stopResult('external-downstream', nextVisited, reporter, context, nextUrlTarget);
    }

    // 4) Nothing left to do → terminate with the most representative
    //    error message available (caller renders it in the summary).
    reporter?.decisionNoMatch();
    return this.stopResult('no-match', nextVisited, reporter, context);
  }

  private stopResult(
    reason: TerminationReason,
    visited: ReadonlySet<string>,
    _reporter: ApiGwReporter | undefined,
    context: RunbookContext,
    downstreamTarget?: string,
  ): StepResult<DecideNextOutput> {
    // The "Esecuzione terminata" closing banner is rendered by the
    // consumer script after `engine.execute()` returns: only there do we
    // know whether the engine's final known-case match overrode this
    // step's local decision. Decide just records the data the banner
    // needs (terminationReason, downstreamTarget, lastErrorMsg).
    const errorMessage = (context.vars.get(`${this.varPrefix}ErrorMsg`) ?? '').trim();
    return {
      success: true,
      output: {
        decision: {
          kind: 'stop',
          reason,
          ...(downstreamTarget !== undefined ? { downstreamTarget } : {}),
        },
      },
      vars: {
        [VISITED_KEYS_VAR]: serializeVisitedKeys(visited),
        terminationReason: reason,
        ...(downstreamTarget !== undefined ? { downstreamTarget } : {}),
        ...(errorMessage !== '' ? { lastErrorMsg: errorMessage } : {}),
      },
      next: 'stop',
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
 * Factory: creates the decision step that drives the dynamic API Gateway
 * analysis loop for a single microservice.
 *
 * The step is meant to run **after** the corresponding `analyze-<service>`
 * step; it inspects:
 * - `<varPrefix>FreshTraceId` / `<varPrefix>FreshTraceIdRaw` to re-query
 *   the same service with a concrete trace id after fallback-UUID lookup,
 * - `<varPrefix>NextUrl` / `<varPrefix>NextUrlTarget` to detect a known URL,
 * - `fallbackUuid` to carry fallback-driven correlation to the next service,
 *
 * and emits one of three flow directives:
 *
 * - `{ goTo: query-<currentService> }` when a fallback query surfaced a
 *   valid `trace_id`; `fallbackUuid` is cleared so the next query uses
 *   only the canonical trace id;
 * - `{ goTo: query-<target> }` when the URL points to a service in scope;
 * - `'stop'` otherwise (external downstream, loop detected, or no signal).
 *
 * The step keeps a running set of `(service|xRayTraceId|fallbackUuid)`
 * keys in the `apiGwVisitedKeys` var so a `goTo` whose destination has
 * already been visited with the same identifiers is short-circuited as
 * a `loop-detected` termination.
 *
 * @param config - Step configuration
 * @returns Step that decides the next flow directive
 */
export function decideNext(config: DecideNextConfig): Step<DecideNextOutput> {
  return new DecideNextStepImpl(config);
}
