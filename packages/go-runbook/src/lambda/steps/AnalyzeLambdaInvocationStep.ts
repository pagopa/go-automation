import type { ResultField } from '@go-automation/go-common/aws';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import { readStepOutput } from '../../steps/data/readStepOutput.js';

import type { DownstreamErrorPattern } from '../types/DownstreamErrorPattern.js';
import { findDownstreamInRows } from '../helpers/matchDownstreamErrorPattern.js';

/**
 * Configuration for {@link analyzeLambdaInvocation}.
 */
export interface AnalyzeLambdaInvocationConfig {
  readonly id: string;
  readonly label: string;
  /** Step id of the invocation-flow query whose rows to analyse. */
  readonly fromStep: string;
  /** Patterns that route a Lambda error to a downstream microservice. */
  readonly downstreamErrorPatterns: ReadonlyArray<DownstreamErrorPattern>;
}

class AnalyzeLambdaInvocationStepImpl implements Step<undefined> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly downstreamErrorPatterns: ReadonlyArray<DownstreamErrorPattern>;

  constructor(config: AnalyzeLambdaInvocationConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.downstreamErrorPatterns = config.downstreamErrorPatterns;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<undefined>> {
    // The error scan already routed to a downstream: nothing to refine.
    if ((context.vars.get('lambdaDownstreamTarget') ?? '').trim() !== '') {
      return { success: true };
    }
    if (this.downstreamErrorPatterns.length === 0) {
      return { success: true };
    }

    // The invocation query is a no-op without a requestId, so it may have no
    // output: treat that as "nothing to analyse" rather than an error.
    const upstream = readStepOutput<ReadonlyArray<ReadonlyArray<ResultField>>>(context, this.fromStep);
    if (!upstream.ok) {
      return { success: true };
    }

    const match = findDownstreamInRows(upstream.value, this.downstreamErrorPatterns);
    if (match === undefined) {
      return { success: true };
    }

    const vars: Record<string, string> = {
      lambdaDownstreamTarget: match.target,
      lastErrorMsg: match.message,
    };
    // The downstream is the actionable signal: promote the category unless a
    // more critical runtime category (timeout/OOM/throttle) was detected.
    const category = (context.vars.get('lambdaErrorCategory') ?? '').trim();
    if (category === '' || category === 'unknown' || category === 'application-error') {
      vars['lambdaErrorCategory'] = 'downstream';
    }

    return { success: true, vars };
  }
}

/**
 * Factory: refines downstream routing using the full invocation flow
 * (`query-lambda-invocation`). Runs after the flow is fetched and only when
 * the error scan did not already route to a downstream: it recovers the
 * `lambdaDownstreamTarget` (and refines `lastErrorMsg`/`lambdaErrorCategory`)
 * when the routing signal appears only in the reconstructed flow.
 *
 * @param config - Step configuration
 * @returns Step that refines downstream routing from the invocation flow
 */
export function analyzeLambdaInvocation(config: AnalyzeLambdaInvocationConfig): Step<undefined> {
  return new AnalyzeLambdaInvocationStepImpl(config);
}
