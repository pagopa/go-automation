import type { GOLogger } from '@pagopa/go-common/logging';
import type { CaseAction, CaseActionType, LogAction } from '../types/CaseAction.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import { interpolatePlaceholders } from '../context/templatePlaceholders.js';
import { throwIfRunbookAborted } from '../context/throwIfRunbookAborted.js';
import type { LogActionRenderer } from './LogActionRenderer.js';
import { PLAIN_LOG_ACTION_RENDERER } from './PLAIN_LOG_ACTION_RENDERER.js';
import { resolveActionMessage } from './resolveActionMessage.js';

/**
 * Result of executing an action.
 * Contains all data needed by TraceBuilder.traceAction().
 */
export interface ActionExecutionResult {
  /** The action that was executed */
  readonly action: CaseAction;
  /** Action type string */
  readonly actionType: CaseActionType;
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
  /**
   * @param logger - Logger of the execution
   * @param renderer - Renderer of log actions (default: plain text)
   */
  constructor(
    private readonly logger: GOLogger,
    private readonly renderer: LogActionRenderer = PLAIN_LOG_ACTION_RENDERER,
  ) {}

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
      throwIfRunbookAborted(context);
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
      if (context.signal?.aborted === true) {
        throw error;
      }
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
    return resolveActionMessage(action, context, this.renderer);
  }

  private async executeAction(action: CaseAction, context: RunbookContext): Promise<void> {
    throwIfRunbookAborted(context);
    switch (action.type) {
      case 'log':
        this.executeLogAction(action, context);
        break;
      case 'notify':
        await this.executeNotifyAction(action.channel, interpolatePlaceholders(action.template, context));
        break;
      case 'update':
        await action.step.execute(context);
        break;
      case 'escalate':
        this.executeEscalateAction(action.team, action.severity, interpolatePlaceholders(action.message, context));
        break;
      case 'composite':
        for (const subAction of action.actions) {
          throwIfRunbookAborted(context);
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
   * Executes a log action.
   *
   * A `known-case` / `unknown-case` action renders as a banner plus a table
   * built straight from its rows; anything else logs the rendered text at
   * the declared level.
   */
  private executeLogAction(action: LogAction, context: RunbookContext): void {
    if (this.renderer.renderToLogger !== undefined) {
      this.renderer.renderToLogger(this.logger, action, context);
      return;
    }
    this.logPlain(action, this.renderer.renderText(action, context));
  }

  private logPlain(action: LogAction, message: string): void {
    switch (action.level) {
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
        const _exhaustive: never = action.level;
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
}
