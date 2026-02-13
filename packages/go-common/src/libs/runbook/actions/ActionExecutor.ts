import type { GOLogger } from '../../core/logging/GOLogger.js';
import type { CaseAction } from './CaseAction.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { ActionTrace } from '../trace/ActionTrace.js';

/**
 * Executes case actions by type.
 * Handles template interpolation for message fields.
 */
export class ActionExecutor {
  constructor(private readonly logger: GOLogger) {}

  /**
   * Executes a case action and returns a trace.
   *
   * @param action - The action to execute
   * @param context - The current runbook context
   * @returns Trace of the action execution
   */
  async execute(action: CaseAction, context: RunbookContext): Promise<ActionTrace> {
    const startTime = Date.now();

    try {
      await this.executeAction(action, context);
      return {
        actionType: action.type,
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        actionType: action.type,
        success: false,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Dispatches action execution by type.
   */
  private async executeAction(action: CaseAction, context: RunbookContext): Promise<void> {
    switch (action.type) {
      case 'log':
        this.executeLogAction(action.level, this.interpolate(action.message, context));
        break;
      case 'notify':
        await this.executeNotifyAction(action.channel, this.interpolate(action.template, context));
        break;
      case 'update':
        await action.step.execute(context);
        break;
      case 'escalate':
        this.executeEscalateAction(action.team, action.severity, this.interpolate(action.message, context));
        break;
      case 'composite':
        for (const subAction of action.actions) {
          await this.executeAction(subAction, context);
        }
        break;
      default: {
        const _exhaustive: never = action;
        throw new Error(`Unknown action type: ${(_exhaustive as CaseAction).type}`);
      }
    }
  }

  /**
   * Executes a log action by writing to the logger.
   */
  private executeLogAction(level: 'info' | 'warn' | 'error', message: string): void {
    switch (level) {
      case 'info':
        this.logger.info(message);
        break;
      case 'warn':
        this.logger.warning(message);
        break;
      case 'error':
        this.logger.error(message);
        break;
      default: {
        const _exhaustive: never = level;
        throw new Error(`Unknown log level: ${String(_exhaustive)}`);
      }
    }
  }

  /**
   * Executes a notify action. Currently logs the notification.
   * In production, this would integrate with Slack, email, etc.
   */
  private async executeNotifyAction(channel: string, message: string): Promise<void> {
    this.logger.info(`[NOTIFY -> ${channel}] ${message}`);
    // Future: integrate with actual notification services
    await Promise.resolve();
  }

  /**
   * Executes an escalate action. Currently logs the escalation.
   * In production, this would create tickets, page on-call, etc.
   */
  private executeEscalateAction(team: string, severity: 'low' | 'medium' | 'high' | 'critical', message: string): void {
    this.logger.warning(`[ESCALATE -> ${team} (${severity})] ${message}`);
    // Future: integrate with PagerDuty, Jira, etc.
  }

  /**
   * Interpolates {{vars.xxx}} and {{params.xxx}} placeholders in a template string.
   *
   * @param template - Template string with {{...}} placeholders
   * @param context - Runbook context for resolving references
   * @returns Interpolated string
   */
  private interpolate(template: string, context: RunbookContext): string {
    return template.replace(/\{\{(vars|params)\.([^}]+)\}\}/g, (_match, source: string, key: string) => {
      if (source === 'vars') {
        return context.vars.get(key) ?? `{{vars.${key}}}`;
      }
      if (source === 'params') {
        return context.params.get(key) ?? `{{params.${key}}}`;
      }
      return _match;
    });
  }
}
