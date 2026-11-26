import { getErrorMessage } from '@pagopa/go-common/errors';

import type { RunbookContext, Step, StepKind, StepResult } from '../../../engine/index.js';
import type { ResolveInteropAlarmContextFn } from './ResolveInteropAlarmContextFn.js';

/**
 * Base of the first step of the INTEROP alarm pipelines: reads `alarmName`, resolves the alarm context, reports it and
 * publishes it as output and vars. A missing alarm name or an alarm the runbook does not answer to fails the step.
 * The subclass names the resolver and the family, and says which lines and vars the context gives.
 *
 * @typeParam TContext - Context of the family
 *
 * @example
 * ```typescript
 * export class ResolveExampleAlarmContextStep extends ResolveInteropAlarmContextStep<ExampleAlarmContext> {
 *   protected resolver(): string {
 *     return 'example-alarm-context';
 *   }
 *   // familyName, describe, contextVars …
 * }
 * ```
 */
export abstract class ResolveInteropAlarmContextStep<TContext> implements Step<TContext> {
  readonly kind: StepKind = 'control';

  /**
   * @param id - Step id
   * @param label - Step label
   * @param resolveAlarmContext - Resolves the context from the alarm name
   */
  protected constructor(
    readonly id: string,
    readonly label: string,
    private readonly resolveAlarmContext: ResolveInteropAlarmContextFn<TContext>,
  ) {}

  /**
   * The alarm name and the resolver, for the trace.
   *
   * @param context - Runbook context
   * @returns Trace metadata of the step
   */
  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return {
      alarmName: context.params.get('alarmName') ?? null,
      resolver: this.resolver(),
    };
  }

  /**
   * Resolves the context of the alarm that fired.
   *
   * @param context - Runbook context
   * @returns The context as output and vars, or a failure
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<TContext>> {
    const alarmName = context.params.get('alarmName');
    if (alarmName === undefined || alarmName.trim() === '') {
      return { success: false, error: 'Missing required parameter: alarmName' };
    }

    let alarmContext: TContext;
    try {
      alarmContext = this.resolveAlarmContext(alarmName);
    } catch (error: unknown) {
      return {
        success: false,
        error: `INTEROP ${this.familyName()} alarm context resolution failed (${this.resolver()}): ${getErrorMessage(error)}`,
      };
    }

    context.services.reporter.add(...this.describe(alarmContext).map((label) => ({ label })));
    return { success: true, output: alarmContext, vars: this.contextVars(alarmContext) };
  }

  /** The resolver named in the trace and in the failure. */
  protected abstract resolver(): string;

  /** The family named in the failure (`k8s`, `API Gateway`). */
  protected abstract familyName(): string;

  /** The narrative lines of a resolved context. */
  protected abstract describe(alarmContext: TContext): ReadonlyArray<string>;

  /** The vars a resolved context publishes. */
  protected abstract contextVars(alarmContext: TContext): Readonly<Record<string, string>>;
}
