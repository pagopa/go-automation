import type { RunbookContext } from '../../types/RunbookContext.js';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import { interpolateTemplate } from '../data/interpolateTemplate.js';

/**
 * Log level for the log step output.
 */
export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Configuration for the log control step.
 */
export interface LogStepConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Log level */
  readonly level: LogLevel;
  /** Template message string (supports {{vars.xxx}} and {{params.xxx}}) */
  readonly message: string;
}

/**
 * Control step that interpolates a template message and produces a log entry.
 * The interpolated message is stored as a variable for downstream consumption.
 *
 * @example
 * ```typescript
 * const step = log({
 *   id: 'log-result',
 *   label: 'Log analysis result',
 *   level: 'info',
 *   message: 'Analysis completed for alarm {{vars.alarmName}} with status {{vars.status}}',
 * });
 * ```
 */
export class LogStep implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  private readonly level: LogLevel;
  private readonly message: string;

  constructor(config: LogStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.level = config.level;
    this.message = config.message;
  }

  /**
   * Interpolates the message template and returns a continue directive.
   * The interpolated message is stored in vars as `{stepId}.message` for downstream access.
   *
   * @param context - The runbook execution context
   * @returns Step result with the interpolated log message in vars
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    const interpolated = interpolateTemplate(this.message, context);
    return {
      success: true,
      vars: { [`${this.id}.message`]: interpolated, [`${this.id}.level`]: this.level },
      next: 'continue',
    };
  }
}

/**
 * Factory function for creating a log control step.
 *
 * @param config - Step configuration
 * @returns A new LogStep instance
 */
export function log(config: LogStepConfig): LogStep {
  return new LogStep(config);
}
