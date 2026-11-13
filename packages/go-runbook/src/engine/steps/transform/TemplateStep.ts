import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { interpolatePlaceholders } from '../../context/templatePlaceholders.js';

/**
 * Configuration for the TemplateStep.
 */
export interface TemplateConfig {
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
 * Step that interpolates a template string using context vars and params.
 * Placeholders follow the format {{vars.name}} or {{params.name}}.
 * Unresolved placeholders are replaced with an empty string.
 *
 * @example
 * ```typescript
 * const step = new TemplateStep({
 *   id: 'build-url',
 *   label: 'Build API URL from params',
 *   template: 'https://api.example.com/{{params.env}}/items/{{vars.itemId}}',
 *   saveAs: 'apiUrl',
 * });
 * ```
 */
export class TemplateStep implements Step<string> {
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
    // The shared placeholder parser of the engine (P09); an unresolved placeholder becomes ''.
    const result = interpolatePlaceholders(this.template, context, { missingValue: '' });

    return {
      success: true,
      output: result,
      vars: { [this.saveAs]: result },
    };
  }
}
