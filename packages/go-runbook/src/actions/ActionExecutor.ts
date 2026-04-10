import type { Core } from '@go-automation/go-common';

type GOLogger = Core.GOLogger;
import type { CaseAction } from './CaseAction.js';
import type { RunbookContext } from '../types/RunbookContext.js';

/**
 * Result of executing an action.
 * Contains all data needed by TraceBuilder.traceAction().
 */
export interface ActionExecutionResult {
  /** The action that was executed */
  readonly action: CaseAction;
  /** Action type string */
  readonly actionType: 'log' | 'notify' | 'update' | 'escalate' | 'composite' | 'fallback';
  /** Execution status */
  readonly status: 'success' | 'failed';
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Resolved message (interpolated template), if applicable */
  readonly resolvedMessage?: string;
  /** Error message, if failed */
  readonly error?: string;
}

/**
 * Executes case actions by type.
 * Handles template interpolation for message fields.
 */
export class ActionExecutor {
  constructor(private readonly logger: GOLogger) {}

  /**
   * Executes a case action and returns execution result data.
   *
   * @param action - The action to execute
   * @param context - The current runbook context
   * @returns Result containing all data for trace
   */
  async execute(action: CaseAction, context: RunbookContext): Promise<ActionExecutionResult> {
    const startTime = Date.now();

    try {
      const resolvedMessage = this.getResolvedMessage(action, context);
      await this.executeAction(action, context);
      return {
        action,
        actionType: action.type,
        status: 'success',
        durationMs: Date.now() - startTime,
        ...(resolvedMessage !== undefined ? { resolvedMessage } : {}),
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const resolvedMessage = this.getResolvedMessage(action, context);
      return {
        action,
        actionType: action.type,
        status: 'failed',
        durationMs: Date.now() - startTime,
        error: errorMessage,
        ...(resolvedMessage !== undefined ? { resolvedMessage } : {}),
      };
    }
  }

  /**
   * Extracts and resolves the message template from an action, if applicable.
   *
   * @param action - The action
   * @param context - The runbook context
   * @returns Resolved message or undefined if action has no message
   */
  private getResolvedMessage(action: CaseAction, context: RunbookContext): string | undefined {
    switch (action.type) {
      case 'log':
        return this.interpolate(action.message, context);
      case 'notify':
        return this.interpolate(action.template, context);
      case 'escalate':
        return this.interpolate(action.message, context);
      case 'update':
      case 'composite':
        return undefined;
      default: {
        const _exhaustive: never = action;
        throw new Error(`Unknown action type: ${(_exhaustive as CaseAction).type}`);
      }
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
