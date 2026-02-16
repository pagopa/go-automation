/**
 * Custom step that analyzes CloudWatch Logs results from a microservice.
 *
 * Takes the output of a CloudWatch Logs query, extracts error messages,
 * and optionally finds the next service invocation in the trace chain.
 * Saves findings as context variables for downstream steps and known case matching.
 *
 * Saves vars:
 * - `{varPrefix}ErrorMsg`: longest error message found
 * - `{varPrefix}NextService`: next service name (if found)
 * - `{varPrefix}NextTraceId`: next trace ID (if found)
 */

import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import type { Runbook } from '@go-automation/go-common';

import { findErrorMessage, findNextServiceInvocation } from './cwLogsHelpers.js';

/**
 * Configuration for AnalyzeServiceLogsStep.
 */
interface AnalyzeServiceLogsConfig {
  readonly id: string;
  readonly label: string;
  /** Step ID of the CW Logs query whose output to analyze */
  readonly fromStep: string;
  /** Prefix for the saved variable names (e.g. 'userAttributes' → 'userAttributesErrorMsg') */
  readonly varPrefix: string;
  /** Whether to detect next service invocations in the logs */
  readonly detectNextService?: boolean;
}

/**
 * Analysis result.
 */
interface ServiceLogsAnalysis {
  readonly errorMessage: string;
  readonly logCount: number;
  readonly nextService: string | undefined;
  readonly nextTraceId: string | undefined;
}

class AnalyzeServiceLogsStepImpl implements Runbook.Step<ServiceLogsAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: Runbook.StepKind = 'transform';

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
  async execute(context: Runbook.RunbookContext): Promise<Runbook.StepResult<ServiceLogsAnalysis>> {
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
    };
  }
}

/**
 * Factory: Creates a step that analyzes microservice CloudWatch Logs results.
 *
 * @param config - Step configuration
 * @returns A step that extracts error info and next service invocations
 */
export function analyzeServiceLogs(config: AnalyzeServiceLogsConfig): Runbook.Step<ServiceLogsAnalysis> {
  return new AnalyzeServiceLogsStepImpl(config);
}
