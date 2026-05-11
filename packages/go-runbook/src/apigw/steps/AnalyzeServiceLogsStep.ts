import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';

import { findErrorMessage } from '../helpers/findErrorMessage.js';
import { findNextServiceInvocation } from '../helpers/findNextServiceInvocation.js';
import { extractFallbackUuid } from '../helpers/extractFallbackUuid.js';
import type { ServiceLogsAnalysis } from './ServiceLogsAnalysis.js';

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
  /** Whether to scan for next-service invocations in the log messages */
  readonly detectNextService?: boolean;
}

class AnalyzeServiceLogsStepImpl implements Step<ServiceLogsAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly varPrefix: string;
  private readonly detectNextService: boolean;

  constructor(config: AnalyzeServiceLogsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.varPrefix = config.varPrefix;
    this.detectNextService = config.detectNextService ?? false;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<ServiceLogsAnalysis>> {
    const rawOutput = context.stepResults.get(this.fromStep);
    if (rawOutput === undefined) {
      return { success: false, error: `Step output not found: "${this.fromStep}"` };
    }

    const results = rawOutput as ReadonlyArray<ResultField[]>;

    if (results.length === 0) {
      return {
        success: true,
        output: { errorMessage: '', logCount: 0, nextService: undefined, nextTraceId: undefined },
        vars: {
          [`${this.varPrefix}ErrorMsg`]: '',
          [`${this.varPrefix}LogCount`]: '0',
        },
      };
    }

    const errorMessage = findErrorMessage(results);
    const vars: Record<string, string> = {
      [`${this.varPrefix}ErrorMsg`]: errorMessage,
      [`${this.varPrefix}LogCount`]: String(results.length),
    };

    // Propagate any fallback UUID emerging from this service's logs to
    // the global `fallbackUuid` var so subsequent service queries can
    // OR-include it (see QueryServiceLogsStep). The var is left untouched
    // when no UUID is detected so an upstream value stays sticky.
    const fallbackUuid = extractFallbackUuid(results);
    if (fallbackUuid !== undefined) {
      vars['fallbackUuid'] = fallbackUuid;
    }

    let nextService: string | undefined;
    let nextTraceId: string | undefined;

    if (this.detectNextService) {
      const invocation = findNextServiceInvocation(results);
      if (invocation !== undefined) {
        nextService = invocation.service;
        nextTraceId = invocation.traceId;
        vars[`${this.varPrefix}NextService`] = invocation.service;
        vars[`${this.varPrefix}NextTraceId`] = invocation.traceId;
      }
    }

    return {
      success: true,
      output: { errorMessage, logCount: results.length, nextService, nextTraceId },
      vars,
      ...(errorMessage !== '' ? { next: 'resolve' as const } : {}),
    };
  }
}

/**
 * Factory: creates a step that analyses microservice CloudWatch Logs query
 * results.
 *
 * The step extracts the most representative error message from the rows
 * (see {@link findErrorMessage}) and, optionally, scans for a next-service
 * invocation pattern (see {@link findNextServiceInvocation}). All findings
 * are written to the runbook context as vars under the configured prefix.
 *
 * When an error message is found the step signals `next: 'resolve'` so
 * the engine can attempt early known-case resolution.
 *
 * Vars written:
 * - `<varPrefix>ErrorMsg`: longest error message (or empty)
 * - `<varPrefix>LogCount`: number of result rows
 * - `<varPrefix>NextService`: next service name (only when `detectNextService=true`)
 * - `<varPrefix>NextTraceId`: next service trace id (only when `detectNextService=true`)
 *
 * @param config - Step configuration
 * @returns Step that produces a {@link ServiceLogsAnalysis}
 */
export function analyzeServiceLogs(config: AnalyzeServiceLogsConfig): Step<ServiceLogsAnalysis> {
  return new AnalyzeServiceLogsStepImpl(config);
}
