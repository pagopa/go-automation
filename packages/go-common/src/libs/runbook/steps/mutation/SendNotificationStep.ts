import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import { interpolateTemplate } from '../data/interpolateTemplate.js';

/**
 * Configuration for the send notification step.
 */
export interface SendNotificationConfig {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable label for logs and UI */
  readonly label: string;
  /** Notification channel (e.g. "slack", "email", "console") */
  readonly channel: string;
  /** Message template supporting {{vars.xxx}} and {{params.xxx}} placeholders */
  readonly message: string;
}

/**
 * Mutation step that sends a notification to a specified channel.
 * Interpolates template placeholders in the message using context vars and params.
 *
 * Currently logs the notification to the console. In the future, this will integrate
 * with external services such as Slack, email, or PagerDuty.
 *
 * @example
 * ```typescript
 * const step = sendNotification({
 *   id: 'notify-team',
 *   label: 'Notify team about alarm resolution',
 *   channel: 'slack',
 *   message: 'Alarm {{params.alarmName}} resolved. Trace ID: {{vars.traceId}}',
 * });
 * ```
 */
class SendNotificationStep implements Step<void> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'mutation';

  private readonly channel: string;
  private readonly message: string;

  constructor(config: SendNotificationConfig) {
    this.id = config.id;
    this.label = config.label;
    this.channel = config.channel;
    this.message = config.message;
  }

  /**
   * Interpolates the message template and sends the notification.
   * Currently outputs to console; future versions will dispatch to external services.
   *
   * @param context - The runbook execution context
   * @returns Step result indicating success or failure
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<void>> {
    try {
      const interpolatedMessage = interpolateTemplate(this.message, context);

      // TODO: integrate with Slack/email/PagerDuty based on this.channel
      process.stdout.write(`[notification:${this.channel}] ${interpolatedMessage}\n`);

      return { success: true, output: undefined };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Send notification failed: ${message}` };
    }
  }
}

/**
 * Factory function for creating a send notification mutation step.
 *
 * @param config - Step configuration
 * @returns A new SendNotificationStep instance
 */
export function sendNotification(config: SendNotificationConfig): Step<void> {
  return new SendNotificationStep(config);
}
