import type { FlowDirective } from '../../types/FlowDirective.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';

/**
 * Configuration for the switch control flow step.
 */
export interface SwitchStepConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Reference to resolve from context (e.g. 'vars.statusCode', 'params.region') */
  readonly ref: string;
  /** Mapping of value -> step ID to jump to */
  readonly cases: Readonly<Record<string, string>>;
  /** Step ID to jump to when no case matches */
  readonly defaultGoTo?: string;
}

/**
 * Control step that resolves a reference from context, matches it against a set of cases,
 * and directs execution to the corresponding step ID.
 *
 * The `goToCases` property is exposed as a public readonly Map for graph analysis.
 *
 * @example
 * ```typescript
 * const step = switchOn({
 *   id: 'route-by-status',
 *   label: 'Route by HTTP status code',
 *   ref: 'vars.statusCode',
 *   cases: { '404': 'handle-not-found', '500': 'handle-server-error', '504': 'handle-timeout' },
 *   defaultGoTo: 'handle-unknown',
 * });
 * ```
 */
export class SwitchStep implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  /** Map of value -> step ID for graph analysis */
  readonly goToCases: ReadonlyMap<string, string>;

  private readonly ref: string;
  private readonly defaultGoTo: string | undefined;

  constructor(config: SwitchStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.ref = config.ref;
    this.defaultGoTo = config.defaultGoTo;
    this.goToCases = new Map(Object.entries(config.cases));
  }

  /**
   * Resolves the reference from context, finds the matching case, and returns a flow directive.
   *
   * @param context - The runbook execution context
   * @returns Step result with a goTo directive for the matched case, or continue/default
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    const resolved = this.resolveRef(this.ref, context);
    const resolvedStr = resolved !== undefined ? String(resolved) : undefined;

    const next = this.resolveDirective(resolvedStr);
    return { success: true, next };
  }

  /**
   * Resolves a reference string from the runbook context.
   * Supports 'vars.{name}' and 'params.{name}' formats.
   */
  private resolveRef(ref: string, context: RunbookContext): string | undefined {
    const dotIndex = ref.indexOf('.');
    if (dotIndex === -1) {
      return undefined;
    }

    const source = ref.slice(0, dotIndex);
    const key = ref.slice(dotIndex + 1);

    if (source === 'vars') {
      return context.vars.get(key);
    }

    if (source === 'params') {
      return context.params.get(key);
    }

    return undefined;
  }

  /**
   * Resolves the flow directive based on the resolved value and configured cases.
   */
  private resolveDirective(value: string | undefined): FlowDirective {
    if (value !== undefined) {
      const target = this.goToCases.get(value);
      if (target !== undefined) {
        return { goTo: target };
      }
    }

    return this.defaultGoTo !== undefined ? { goTo: this.defaultGoTo } : 'continue';
  }
}

/**
 * Factory function for creating a switch control flow step.
 *
 * @param config - Step configuration
 * @returns A new SwitchStep instance
 */
export function switchOn(config: SwitchStepConfig): SwitchStep {
  return new SwitchStep(config);
}
