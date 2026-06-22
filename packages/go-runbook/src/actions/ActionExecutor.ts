import type { GOLogger } from '@go-automation/go-common/core';
import type { CaseAction, CaseActionType, LogAction } from './CaseAction.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import { interpolatePlaceholders } from '../core/templatePlaceholders.js';
import { throwIfRunbookAborted } from '../core/throwIfRunbookAborted.js';

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

interface KnownCaseLogMessage {
  readonly rows: ReadonlyArray<KnownCaseLogRow>;
}

interface KnownCaseLogRow {
  readonly field: string;
  readonly value: string;
}

const KNOWN_CASE_PREFIX = '[CASO NOTO]';
const UNKNOWN_CASE_PREFIX = '[CASO NON RICONOSCIUTO]';
const UNAVAILABLE_VALUE = 'non disponibile';

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
    switch (action.type) {
      case 'log': {
        const missingValue = missingValueFor(action.message);
        return interpolatePlaceholders(action.message, context, missingValue === undefined ? {} : { missingValue });
      }
      case 'notify':
        return interpolatePlaceholders(action.template, context);
      case 'escalate':
        return interpolatePlaceholders(action.message, context);
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
    throwIfRunbookAborted(context);
    switch (action.type) {
      case 'log': {
        const missingValue = missingValueFor(action.message);
        this.executeLogAction(
          action,
          interpolatePlaceholders(action.message, context, missingValue === undefined ? {} : { missingValue }),
        );
        break;
      }
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
   * Executes a log action by writing to the logger.
   */
  private executeLogAction(action: LogAction, message: string): void {
    if (action.renderAs === 'known-case') {
      this.renderStructuredLog(
        parseStructuredLog(message, KNOWN_CASE_SPEC) ?? parseStructuredLog(message, GENERIC_CASO_SPEC),
        KNOWN_CASE_BANNER,
      );
      return;
    }

    if (action.renderAs === 'unknown-case') {
      this.renderStructuredLog(
        parseStructuredLog(message, UNKNOWN_CASE_SPEC) ?? parseStructuredLog(message, GENERIC_ESITO_SPEC),
        UNKNOWN_CASE_BANNER,
      );
      return;
    }

    const knownCaseLog = parseStructuredLog(message, KNOWN_CASE_SPEC);
    if (knownCaseLog !== undefined) {
      this.renderStructuredLog(knownCaseLog, KNOWN_CASE_BANNER);
      return;
    }

    const unknownCaseLog = parseStructuredLog(message, UNKNOWN_CASE_SPEC);
    if (unknownCaseLog !== undefined) {
      this.renderStructuredLog(unknownCaseLog, UNKNOWN_CASE_BANNER);
      return;
    }

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
   * Renders a parsed structured-log message as a separated banner + table
   * block. The banner distinguishes known-case (success) from
   * unknown-case (warning) outcomes.
   */
  private renderStructuredLog(message: KnownCaseLogMessage, banner: StructuredLogBanner): void {
    this.logger.newline();
    if (banner.kind === 'success') {
      this.logger.success(banner.text);
    } else {
      this.logger.warning(banner.text);
    }
    this.logger.table({
      columns: [
        { header: 'Campo', key: 'field', width: 24 },
        { header: 'Valore', key: 'value' },
      ],
      data: message.rows.map((row) => ({ field: row.field, value: row.value })),
      maxColumnWidth: 120,
      style: { colors: false },
    });
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

/**
 * Banner rendered above a structured-log table.
 */
interface StructuredLogBanner {
  readonly kind: 'success' | 'warning';
  readonly text: string;
}

/** Transform applied to every detail value before it enters a row. */
type StructuredLogValueTransformer = (value: string) => string;

/** Predicate deciding whether a parsed detail row is kept. */
type StructuredLogRowPredicate = (row: KnownCaseLogRow) => boolean;

/**
 * Declarative spec describing how to parse one family of structured log
 * messages (known-case, unknown-case, or a generic prefix-less block).
 */
interface StructuredLogSpec {
  /** When set, the message must start with this prefix or the parse fails. */
  readonly prefix?: string;
  /** Field label for the title (first) row. */
  readonly firstField: string;
  /** Title used when the first line is empty / prefix-only. */
  readonly fallbackTitle: string;
  /** Optional transform applied to every detail value. */
  readonly normalizeValue?: StructuredLogValueTransformer;
  /** Optional predicate; detail rows for which it returns false are dropped. */
  readonly keepRow?: StructuredLogRowPredicate;
}

const KNOWN_CASE_BANNER: StructuredLogBanner = { kind: 'success', text: 'Caso noto rilevato' };
const UNKNOWN_CASE_BANNER: StructuredLogBanner = { kind: 'warning', text: 'Caso non riconosciuto' };

const KNOWN_CASE_SPEC = {
  prefix: KNOWN_CASE_PREFIX,
  firstField: 'Caso',
  fallbackTitle: 'Caso noto',
} satisfies StructuredLogSpec;

const UNKNOWN_CASE_SPEC = {
  prefix: UNKNOWN_CASE_PREFIX,
  firstField: 'Esito',
  fallbackTitle: 'Impossibile identificare la causa',
  normalizeValue: normalizeUnknownCaseValue,
  keepRow: isUsefulUnknownCaseRow,
} satisfies StructuredLogSpec;

const GENERIC_CASO_SPEC = { firstField: 'Caso', fallbackTitle: UNAVAILABLE_VALUE } satisfies StructuredLogSpec;
const GENERIC_ESITO_SPEC = { firstField: 'Esito', fallbackTitle: UNAVAILABLE_VALUE } satisfies StructuredLogSpec;

/**
 * Parses a multi-line structured log message into `{ field, value }` rows.
 *
 * The first line becomes the title row; subsequent lines are split on the
 * first `:` into `field: value`, or numbered `Dettaglio[ N]` when they
 * carry no separator. When `spec.prefix` is set the message must start
 * with it (otherwise `undefined` is returned so callers can fall back to a
 * prefix-less generic spec); a prefix-less spec always produces a result.
 */
function parseStructuredLog(
  message: string,
  spec: StructuredLogSpec & { readonly prefix: string },
): KnownCaseLogMessage | undefined;
function parseStructuredLog(
  message: string,
  spec: StructuredLogSpec & { readonly prefix?: undefined },
): KnownCaseLogMessage;
function parseStructuredLog(message: string, spec: StructuredLogSpec): KnownCaseLogMessage | undefined {
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const [firstLine, ...details] = lines;

  let title: string;
  if (spec.prefix !== undefined) {
    if (firstLine?.startsWith(spec.prefix) !== true) {
      return undefined;
    }
    title = firstLine.slice(spec.prefix.length).trim() || spec.fallbackTitle;
  } else {
    title = firstLine ?? spec.fallbackTitle;
  }

  const normalize = spec.normalizeValue ?? ((value: string): string => value);
  const rows: KnownCaseLogRow[] = [{ field: spec.firstField, value: title }];

  let detailCount = 0;
  for (const detail of details) {
    const separatorIndex = detail.indexOf(':');
    let row: KnownCaseLogRow;
    if (separatorIndex > 0) {
      row = {
        field: detail.slice(0, separatorIndex).trim(),
        value: normalize(detail.slice(separatorIndex + 1).trim()),
      };
    } else {
      detailCount += 1;
      row = {
        field: detailCount === 1 ? 'Dettaglio' : `Dettaglio ${detailCount}`,
        value: normalize(detail),
      };
    }

    if (spec.keepRow === undefined || spec.keepRow(row)) {
      rows.push(row);
    }
  }

  return { rows };
}

function normalizeUnknownCaseValue(value: string): string {
  const withoutRawPlaceholders = value.replace(/\{\{(?:vars|params)\.[^}{]+\}\}/g, UNAVAILABLE_VALUE).trim();
  if (withoutRawPlaceholders === '') return UNAVAILABLE_VALUE;

  if (!withoutRawPlaceholders.includes('=')) {
    return withoutRawPlaceholders;
  }

  const parts = withoutRawPlaceholders
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .filter((part) => {
      const eqIndex = part.indexOf('=');
      if (eqIndex < 0) return true;
      const partValue = part.slice(eqIndex + 1).trim();
      return isAvailableValue(partValue);
    });

  return parts.length === 0 ? UNAVAILABLE_VALUE : parts.join('; ');
}

function isUsefulUnknownCaseRow(row: KnownCaseLogRow): boolean {
  if (row.field === 'Esito' || row.field === 'Dettaglio' || row.field === 'Errori API Gateway') {
    return true;
  }
  return isAvailableValue(row.value);
}

function isAvailableValue(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase('it-IT');
  return normalized !== '' && normalized !== UNAVAILABLE_VALUE && normalized !== 'n/a';
}

function missingValueFor(template: string): string | undefined {
  return template.trimStart().startsWith(UNKNOWN_CASE_PREFIX) ? UNAVAILABLE_VALUE : undefined;
}
