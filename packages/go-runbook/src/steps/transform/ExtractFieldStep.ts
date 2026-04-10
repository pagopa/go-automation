import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { navigateFieldPath } from './fieldPath.js';
import { Core } from '@go-automation/go-common';

const { valueToString } = Core;

/**
 * Configuration for the ExtractFieldStep.
 */
interface ExtractFieldConfig {
  /** Unique identifier of the step within the runbook */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Step ID whose output to read from context.stepResults */
  readonly fromStep: string;
  /** Dot/bracket path to navigate (e.g. '[0].status' or 'data.items[2].name') */
  readonly fieldPath: string;
  /** Variable name to save the extracted value into context.vars */
  readonly saveAs: string;
}

/**
 * Step that extracts a field from a previous step's output using dot/bracket path notation.
 * The extracted value is converted to a string and saved as a context variable.
 *
 * @example
 * ```typescript
 * const step = extractField({
 *   id: 'extract-status',
 *   label: 'Extract status from response',
 *   fromStep: 'fetch-data',
 *   fieldPath: '[0].status',
 *   saveAs: 'statusValue',
 * });
 * ```
 */
class ExtractFieldStep implements Step<string> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly fieldPath: string;
  private readonly saveAs: string;

  constructor(config: ExtractFieldConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.fieldPath = config.fieldPath;
    this.saveAs = config.saveAs;
  }

  /**
   * Executes the field extraction by navigating the fieldPath on the source step's output.
   *
   * @param context - The current runbook execution context
   * @returns A StepResult containing the extracted string value and updated vars
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<string>> {
    const sourceOutput = context.stepResults.get(this.fromStep);

    if (sourceOutput === undefined) {
      return {
        success: false,
        error: `Step output not found for stepId: "${this.fromStep}"`,
      };
    }

    const value = navigateFieldPath(sourceOutput, this.fieldPath);

    if (value === undefined) {
      return {
        success: false,
        error: `Field path "${this.fieldPath}" resolved to undefined on output of step "${this.fromStep}"`,
      };
    }

    const stringValue = valueToString(value);

    return {
      success: true,
      output: stringValue,
      vars: { [this.saveAs]: stringValue },
    };
  }
}

/**
 * Factory function that creates an ExtractFieldStep instance.
 *
 * @param config - Configuration for the extract field step
 * @returns A Step that extracts a field value from a previous step's output
 */
export function extractField(config: ExtractFieldConfig): Step<string> {
  return new ExtractFieldStep(config);
}
