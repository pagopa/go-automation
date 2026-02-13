import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';

/**
 * Configuration for the TemplateStep.
 */
interface TemplateConfig {
  /** Unique identifier of the step within the runbook */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Template string with {{vars.xxx}} and {{params.xxx}} placeholders */
  readonly template: string;
  /** Variable name to save the interpolated result into context.vars */
  readonly saveAs: string;
}

/**
 * Regex pattern matching {{vars.xxx}} and {{params.xxx}} placeholders.
 * Compiled once and reused across all executions.
 */
const PLACEHOLDER_REGEX = /\{\{(vars|params)\.([^}]+)\}\}/g;

/**
 * Step that interpolates a template string using context vars and params.
 * Placeholders follow the format {{vars.name}} or {{params.name}}.
 * Unresolved placeholders are replaced with an empty string.
 *
 * @example
 * ```typescript
 * const step = template({
 *   id: 'build-url',
 *   label: 'Build API URL from params',
 *   template: 'https://api.example.com/{{params.env}}/items/{{vars.itemId}}',
 *   saveAs: 'apiUrl',
 * });
 * ```
 */
class TemplateStep implements Step<string> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly template: string;
  private readonly saveAs: string;

  constructor(config: TemplateConfig) {
    this.id = config.id;
    this.label = config.label;
    this.template = config.template;
    this.saveAs = config.saveAs;
  }

  /**
   * Executes the template interpolation using context vars and params.
   *
   * @param context - The current runbook execution context
   * @returns A StepResult containing the interpolated string and updated vars
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<string>> {
    const result = this.template.replace(PLACEHOLDER_REGEX, (_match: string, source: string, key: string): string => {
      const map = source === 'vars' ? context.vars : context.params;
      return map.get(key) ?? '';
    });

    return {
      success: true,
      output: result,
      vars: { [this.saveAs]: result },
    };
  }
}

/**
 * Factory function that creates a TemplateStep instance.
 *
 * @param config - Configuration for the template step
 * @returns A Step that interpolates a template string with context vars and params
 */
export function template(config: TemplateConfig): Step<string> {
  return new TemplateStep(config);
}
