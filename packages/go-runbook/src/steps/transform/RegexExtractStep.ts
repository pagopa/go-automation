import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { navigateFieldPath } from './fieldPath.js';
import { compileRegex } from '../../core/compileRegex.js';
import { Core } from '@go-automation/go-common';

const { valueToString } = Core;

/**
 * Configuration for the RegexExtractStep.
 */
interface RegexExtractConfig {
  /** Unique identifier of the step within the runbook */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Step ID whose output to read from context.stepResults */
  readonly fromStep: string;
  /** Dot/bracket path to navigate on the source output */
  readonly fieldPath: string;
  /** Regular expression pattern string to apply on the resolved value */
  readonly pattern: string;
  /** Capture group number to extract (0 for full match) */
  readonly group: number;
  /** Variable name to save the extracted value into context.vars */
  readonly saveAs: string;
}

/**
 * Step that extracts a value from a previous step's output using a regular expression.
 * Navigates the fieldPath first, then applies the regex pattern and extracts the specified
 * capture group. The result is saved as a context variable.
 *
 * @example
 * ```typescript
 * const step = regexExtract({
 *   id: 'extract-error-code',
 *   label: 'Extract error code from message',
 *   fromStep: 'fetch-logs',
 *   fieldPath: '[0].message',
 *   pattern: 'ERROR_(\\d+)',
 *   group: 1,
 *   saveAs: 'errorCode',
 * });
 * ```
 */
class RegexExtractStep implements Step<string | undefined> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly fieldPath: string;
  private readonly pattern: string;
  private readonly group: number;
  private readonly saveAs: string;

  constructor(config: RegexExtractConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.fieldPath = config.fieldPath;
    this.pattern = config.pattern;
    this.group = config.group;
    this.saveAs = config.saveAs;
  }

  /**
   * Executes the regex extraction on the resolved field value.
   *
   * @param context - The current runbook execution context
   * @returns A StepResult containing the matched group string or undefined
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<string | undefined>> {
    const sourceOutput = context.stepResults.get(this.fromStep);

    if (sourceOutput === undefined) {
      return {
        success: false,
        error: `Step output not found for stepId: "${this.fromStep}"`,
      };
    }

    const fieldValue = navigateFieldPath(sourceOutput, this.fieldPath);

    if (fieldValue === undefined || fieldValue === null) {
      return {
        success: false,
        error: `Field path "${this.fieldPath}" resolved to ${String(fieldValue)} on output of step "${this.fromStep}"`,
      };
    }

    const stringValue = valueToString(fieldValue);
    const regex = compileRegex(this.pattern);
    const match = regex.exec(stringValue);

    if (match === null) {
      return {
        success: true,
        output: undefined,
        vars: { [this.saveAs]: '' },
      };
    }

    const groupValue = match[this.group];
    const extracted = groupValue ?? '';

    return {
      success: true,
      output: extracted === '' ? undefined : extracted,
      vars: { [this.saveAs]: extracted },
    };
  }
}

/**
 * Factory function that creates a RegexExtractStep instance.
 *
 * @param config - Configuration for the regex extract step
 * @returns A Step that extracts a regex capture group from a previous step's output
 */
export function regexExtract(config: RegexExtractConfig): Step<string | undefined> {
  return new RegexExtractStep(config);
}
