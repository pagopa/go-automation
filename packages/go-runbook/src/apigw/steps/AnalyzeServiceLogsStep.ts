import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';

import { findErrorMessage } from '../helpers/findErrorMessage.js';
import { findKnownUrlInLogs } from '../helpers/findKnownUrlInLogs.js';
import { extractFallbackUuid } from '../helpers/extractFallbackUuid.js';
import { findTraceIdCandidate } from '../helpers/findTraceIdCandidate.js';
import { ApiGwReporter } from '../reporting/ApiGwReporter.js';
import type { KnownUrlsRegistry } from '../registries/KnownUrlsRegistry.js';
import type { ServiceLogsAnalysis } from './ServiceLogsAnalysis.js';
import type { ServiceLogSchema } from '../profiles/schemas/ServiceLogSchema.js';
import { SEND_API_GW_PROFILE } from '../profiles/SEND_API_GW_PROFILE.js';

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
   * Canonical name of the service being analysed. Required only for
   * main-loop analysis that needs to detect a `trace_id` after a
   * fallback-UUID query. Pre-step / probe usages can omit it.
   */
  readonly serviceName?: string;
  /**
   * Deprecated compatibility option. Routing is handled by
   * `decideNext` after known-case early resolution, so this analysis
   * step only records the target vars.
   */
  readonly servicesInRunbook?: ReadonlySet<string>;
  /**
   * Deprecated compatibility option. Dynamic `goTo` targets are built
   * by `decideNext`.
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
  /**
   * Schema dei log applicativi (propagato agli helper). Quando omesso,
   * usa lo schema SEND di default per back-compat.
   */
  readonly schema?: ServiceLogSchema;
}

class AnalyzeServiceLogsStepImpl implements Step<ServiceLogsAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly varPrefix: string;
  private readonly registry: KnownUrlsRegistry;
  private readonly serviceName: string | undefined;
  private readonly quiet: boolean;
  private readonly schema: ServiceLogSchema;

  constructor(config: AnalyzeServiceLogsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.varPrefix = config.varPrefix;
    this.registry = config.registry;
    this.serviceName = config.serviceName;
    this.quiet = config.quiet ?? false;
    this.schema = config.schema ?? SEND_API_GW_PROFILE.serviceLog.schema;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<ServiceLogsAnalysis>> {
    const rawOutput = context.stepResults.get(this.fromStep);
    if (rawOutput === undefined) {
      return { success: false, error: `Step output not found: "${this.fromStep}"` };
    }

    const results = rawOutput as ReadonlyArray<ResultField[]>;
    const reporter = !this.quiet && context.logger !== undefined ? new ApiGwReporter(context.logger) : undefined;

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
          freshTraceId: undefined,
          freshTraceIdRaw: undefined,
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

    const errorMessage = findErrorMessage(results, this.schema);
    const knownUrl = findKnownUrlInLogs(results, this.registry, this.schema);

    const extractedFallback = knownUrl !== undefined ? extractFallbackUuid(results, this.schema) : undefined;
    const fallbackIsFresh = extractedFallback !== undefined && extractedFallback !== fallbackUuidExisting;
    const freshTrace =
      this.serviceName !== undefined && fallbackUuidExisting !== ''
        ? findTraceIdCandidate(results, this.schema)
        : undefined;

    const vars: Record<string, string> = {
      [`${this.varPrefix}ErrorMsg`]: errorMessage,
      [`${this.varPrefix}LogCount`]: String(results.length),
      [`${this.varPrefix}NextUrl`]: knownUrl?.observedUrl ?? '',
      [`${this.varPrefix}NextUrlTarget`]: knownUrl?.known.target ?? '',
      [`${this.varPrefix}FallbackUuidFresh`]: fallbackIsFresh ? 'true' : 'false',
      [`${this.varPrefix}FreshTraceId`]: freshTrace?.canonical ?? '',
      [`${this.varPrefix}FreshTraceIdRaw`]: freshTrace?.raw ?? '',
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

    return {
      success: true,
      output: {
        errorMessage,
        logCount: results.length,
        knownUrl: knownUrl?.observedUrl,
        knownUrlTarget: knownUrl?.known.target,
        fallbackUuidExtracted: fallbackIsFresh ? extractedFallback : undefined,
        freshTraceId: freshTrace?.canonical,
        freshTraceIdRaw: freshTrace?.raw,
      },
      vars,
      // Default branch: signal known-case resolution. Even cases that
      // match on absence (e.g. `<prefix>LogCount == '0'`) need their
      // chance before `decide-<service>` declares the search closed.
      next: 'resolve' as const,
    };
  }
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
 * - extracts a new `FALLBACK-UUID` token only when the same result set
 *   also points to a known downstream URL;
 * - records a `trace_id` when the query was driven by an existing
 *   fallback UUID.
 *
 * The step always signals `next: 'resolve'` so the engine evaluates
 * known cases before any dynamic traversal decision. If no case
 * matches, the following `decide-<service>` step consumes the recorded
 * URL / fallback / trace vars and decides whether to re-query, jump to
 * another service, or stop.
 *
 * Vars written:
 * - `<varPrefix>ErrorMsg`: longest error message (empty when none)
 * - `<varPrefix>LogCount`: number of result rows
 * - `<varPrefix>NextUrl`: observed URL matched by the registry (empty when none)
 * - `<varPrefix>NextUrlTarget`: target name of the matched URL (empty when none)
 * - `<varPrefix>FallbackUuidFresh`: `"true"` iff a known downstream URL
 *   and a new fallback UUID were detected during this analysis call
 * - `<varPrefix>FreshTraceId`: canonical trace id found after a fallback query
 * - `<varPrefix>FreshTraceIdRaw`: raw trace id value observed in logs
 * - `fallbackUuid`: updated only when a new value is extracted (sticky otherwise)
 *
 * @param config - Step configuration
 * @returns Step that produces a {@link ServiceLogsAnalysis}
 */
export function analyzeServiceLogs(config: AnalyzeServiceLogsConfig): Step<ServiceLogsAnalysis> {
  return new AnalyzeServiceLogsStepImpl(config);
}
