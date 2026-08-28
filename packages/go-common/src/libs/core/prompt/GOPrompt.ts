/**
 * GOPrompt - Unified prompt system
 * Integrates spinner, loading bar, and user input prompts
 */

import readline from 'node:readline';
import {
  checkbox as inquirerCheckbox,
  confirm as inquirerConfirm,
  input as inquirerInput,
  number as inquirerNumber,
  password as inquirerPassword,
  search as inquirerSearch,
  select as inquirerSelect,
} from '@inquirer/prompts';

import { DateTime } from 'luxon';

import { GOLogEventCategory } from '../logging/GOLogEventCategory.js';
import { GOLogger } from '../logging/GOLogger.js';
import {
  describeDateInputFormats,
  parseDateInput,
  tryParseDateInput,
  type GODateBoundary,
  type GODateInputOptions,
} from '../utils/GODateInput.js';
import { valueToString } from '../utils/GOValueToString.js';

import { GOLoadingBar } from './GOLoadingBar.js';
import { GOMultiSpinner } from './GOMultiSpinner.js';

/**
 * Flag to track if the process was interrupted via Ctrl+C.
 */
let isCtrlC = false;

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  isCtrlC = true;
});

export type GOPromptTextValidator = (value: string) => boolean | string;

export type GOPromptNumberValidator = (value: number) => boolean | string;

export type GOPromptAutocompleteSuggestHandler = (
  input: string,
  choices: GOPromptSelectOption[],
) => Promise<GOPromptSelectOption[]>;

export interface GOPromptTextOptions {
  /** Default value */
  initial?: string;

  /** Validation function */
  validate?: GOPromptTextValidator;
}

export interface GOPromptConfirmOptions {
  /** Default value */
  initial?: boolean;
}

export interface GOPromptNumberOptions {
  /** Default value */
  initial?: number;

  /** Minimum value */
  min?: number;

  /** Maximum value */
  max?: number;

  /** Validation function */
  validate?: GOPromptNumberValidator;
}

export type GOPromptDateValidator = (value: Date) => boolean | string;

export interface GOPromptDateOptions {
  /** Default value, prefilled and editable; a Date is shown as ISO 8601 */
  readonly initial?: string | Date;

  /** IANA time zone used to resolve inputs without an explicit offset (default `UTC`) */
  readonly timeZone?: string;

  /** Edge of the day for answers carrying no time (default `start`) */
  readonly boundary?: GODateBoundary;

  /** Accept an empty answer, resolved as `undefined` (default: false) */
  readonly allowEmpty?: boolean;

  /** Earliest accepted instant */
  readonly min?: Date;

  /** Latest accepted instant */
  readonly max?: Date;

  /** Reference instant for relative answers; injected by tests (default: now) */
  readonly now?: Date;

  /** Validation function, run on the parsed date */
  readonly validate?: GOPromptDateValidator;
}

/** Computes one bound of a preset range. Must be pure. */
export type GOPromptDateRangeBoundFn = (now: Date, timeZone: string) => Date;

export interface GOPromptDateRangePreset {
  /** Entry shown in the preset list */
  readonly title: string;

  /** Start of the range; omitted means unbounded */
  readonly from?: GOPromptDateRangeBoundFn;

  /** End of the range; omitted means unbounded */
  readonly to?: GOPromptDateRangeBoundFn;

  /** Ask for both bounds instead of computing them (default: false) */
  readonly custom?: boolean;
}

export interface GOPromptDateRange {
  /** Start of the range; `undefined` means unbounded */
  readonly from?: Date;

  /** End of the range; `undefined` means unbounded */
  readonly to?: Date;
}

export interface GOPromptDateRangeOptions {
  /** Preset list shown before asking for explicit bounds (default: `GO_DEFAULT_DATE_RANGE_PRESETS`) */
  readonly presets?: ReadonlyArray<GOPromptDateRangePreset>;

  /** IANA time zone used to resolve the bounds (default `UTC`) */
  readonly timeZone?: string;

  /** Reference instant for the presets; injected by tests (default: now) */
  readonly now?: Date;

  /** Message of the start-date question, on the custom branch */
  readonly fromMessage?: string;

  /** Message of the end-date question, on the custom branch */
  readonly toMessage?: string;
}

export interface GOPromptSelectOption {
  /** Option title */
  title: string;

  /** Option value */
  value?: unknown;

  /** Option description (optional) */
  description?: string;
}

export interface GOPromptMultiselectOption {
  /** Option title */
  title: string;

  /** Option value */
  value: unknown;

  /** Initially selected (default: false) */
  selected?: boolean;

  /** Option description (optional) */
  description?: string;
}

export interface GOPromptAutocompleteOptions {
  /** Maximum number of results to show (default: 10) */
  limit?: number;

  /** Suggestion function for custom filtering */
  suggest?: GOPromptAutocompleteSuggestHandler;
}

export interface GOPromptChoice<T = unknown> {
  readonly name: string;
  readonly value: T;
  readonly description?: string;
  readonly checked?: boolean;
}

export interface GOPromptInputOptions {
  readonly message: string;
  readonly default?: string;
  readonly validate?: GOPromptTextValidator;
}

export interface GOPromptNumberInputOptions {
  readonly message: string;
  readonly default?: number;
  readonly validate?: GOPromptNumberInputValidator;
}

export interface GOPromptConfirmInputOptions {
  readonly message: string;
  readonly default?: boolean;
}

export interface GOPromptSelectInputOptions<T> {
  readonly message: string;
  readonly choices: ReadonlyArray<GOPromptChoice<T>>;
  readonly pageSize?: number;
  readonly source?: GOPromptSelectSourceFn<T>;
}

export type GOPromptNumberInputValidator = (value: number | undefined) => boolean | string;
export type GOPromptSelectSourceFn<T> = (term: string | undefined) => Promise<ReadonlyArray<GOPromptChoice<T>>>;
export type GOPromptRunnerFn<T> = () => Promise<T | undefined>;
export type GOPromptTextHandler = (options: GOPromptInputOptions) => Promise<string | undefined>;
export type GOPromptNumberHandler = (options: GOPromptNumberInputOptions) => Promise<number | undefined>;
export type GOPromptConfirmHandler = (options: GOPromptConfirmInputOptions) => Promise<boolean | undefined>;
export type GOPromptSelectHandler = <T>(options: GOPromptSelectInputOptions<T>) => Promise<T | undefined>;
export type GOPromptCheckboxHandler = <T>(options: GOPromptSelectInputOptions<T>) => Promise<T[] | undefined>;

export interface GOPromptAdapter {
  readonly text: GOPromptTextHandler;
  readonly password: GOPromptTextHandler;
  readonly number: GOPromptNumberHandler;
  readonly confirm: GOPromptConfirmHandler;
  readonly select: GOPromptSelectHandler;
  readonly checkbox: GOPromptCheckboxHandler;
  readonly search: GOPromptSelectHandler;
}

const inquirerPromptAdapter: GOPromptAdapter = {
  text: inquirerInput,
  password: inquirerPassword,
  number: inquirerNumber,
  confirm: inquirerConfirm,
  select: inquirerSelect,
  checkbox: inquirerCheckbox,
  search: async (options) =>
    inquirerSearch({
      message: options.message,
      ...(options.pageSize !== undefined ? { pageSize: options.pageSize } : {}),
      source: async (term) => options.source?.(term) ?? options.choices,
    }),
};

function toGOPromptSelectOptions(choices: ReadonlyArray<GOPromptChoice>): GOPromptSelectOption[] {
  return choices.map((choice) => {
    const promptValue = choice.value;

    return {
      title: choice.name,
      ...(promptValue !== undefined ? { value: promptValue } : {}),
      ...(choice.description !== undefined ? { description: choice.description } : {}),
    };
  });
}

/**
 * Preset ranges offered by `GOPrompt.dateRange` when the caller supplies none.
 *
 * Titles are in English, like every other built-in message of this module;
 * pass `presets` to localize them or to offer a different set.
 */
export const GO_DEFAULT_DATE_RANGE_PRESETS: ReadonlyArray<GOPromptDateRangePreset> = [
  { title: 'Last 24 hours', from: (now) => shiftMillis(now, -24 * 3_600_000), to: (now) => new Date(now.getTime()) },
  { title: 'Last 7 days', from: (now) => shiftMillis(now, -7 * 86_400_000), to: (now) => new Date(now.getTime()) },
  { title: 'Last 30 days', from: (now) => shiftMillis(now, -30 * 86_400_000), to: (now) => new Date(now.getTime()) },
  {
    title: 'Current month',
    from: (now, timeZone) => DateTime.fromJSDate(now).setZone(timeZone).startOf('month').toJSDate(),
    to: (now) => new Date(now.getTime()),
  },
  { title: 'No limit' },
  { title: 'Custom…', custom: true },
];

/** Shifts an instant by a signed amount of milliseconds, without mutating it. */
function shiftMillis(value: Date, millis: number): Date {
  return new Date(value.getTime() + millis);
}

/** Narrows the prompt options down to what the date parser needs. */
function toDateInputOptions(options?: GOPromptDateOptions): GODateInputOptions {
  return {
    ...(options?.timeZone !== undefined ? { timeZone: options.timeZone } : {}),
    ...(options?.boundary !== undefined ? { boundary: options.boundary } : {}),
    ...(options?.now !== undefined ? { now: options.now } : {}),
  };
}

/** Renders the prefilled answer: a Date becomes the ISO 8601 text the user can edit. */
function formatInitialDate(initial: string | Date | undefined): string | undefined {
  if (initial === undefined) return undefined;
  return initial instanceof Date ? initial.toISOString() : initial;
}

/** Validates a typed date answer, reporting the accepted formats on failure. */
function validateDateAnswer(
  raw: string,
  options: GOPromptDateOptions | undefined,
  parseOptions: GODateInputOptions,
): boolean | string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return options?.allowEmpty === true ? true : 'A date is required';
  }

  const parsed = tryParseDateInput(trimmed, parseOptions);
  if (parsed === undefined) {
    return `Invalid date. Accepted formats: ${describeDateInputFormats()}`;
  }

  if (options?.min !== undefined && parsed.date.getTime() < options.min.getTime()) {
    return `Date must be on or after ${options.min.toISOString()}`;
  }
  if (options?.max !== undefined && parsed.date.getTime() > options.max.getTime()) {
    return `Date must be on or before ${options.max.toISOString()}`;
  }

  return options?.validate?.(parsed.date) ?? true;
}

function isExitPromptError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ExitPromptError';
}

/**
 * Unified prompt system with spinner, loading, and user input
 */
export class GOPrompt {
  private readonly spinner: GOMultiSpinner;
  private readonly loadingBar: GOLoadingBar;
  private readonly logger: GOLogger;
  private readonly logResponses: boolean;
  private readonly promptAdapter: GOPromptAdapter;

  constructor(logger: GOLogger, logResponses: boolean = false, promptAdapter: GOPromptAdapter = inquirerPromptAdapter) {
    this.logger = logger;
    this.spinner = new GOMultiSpinner();
    this.loadingBar = new GOLoadingBar();
    this.logResponses = logResponses;
    this.promptAdapter = promptAdapter;

    // Ensure keypress events are emitted on stdin
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
    }
  }

  /**
   * Internal wrapper to distinguish Ctrl+C from Esc and ensure Esc always returns undefined
   */
  private async runPrompt<T>(prompt: GOPromptRunnerFn<T>): Promise<T | undefined> {
    let isEsc = false;
    isCtrlC = false;

    // Local keypress listener for high-priority detection of Ctrl+C and Esc
    const onKeypress = (_str: string, key: { ctrl?: boolean; name?: string } | undefined): void => {
      if (key) {
        if (key.ctrl && key.name === 'c') {
          isCtrlC = true;
        }
        if (key.name === 'escape') {
          isEsc = true;
        }
      }
    };

    process.stdin.on('keypress', onKeypress);

    try {
      const value = await prompt();

      // If Esc was pressed, we ALWAYS want to return undefined,
      // even if the prompt somehow returned a value.
      if (isEsc || value === undefined) {
        return undefined;
      }

      return value;
    } catch (error) {
      if (isCtrlC) {
        process.exit(130);
      }
      if (isEsc || isExitPromptError(error)) {
        return undefined;
      }
      throw error;
    } finally {
      process.stdin.removeListener('keypress', onKeypress);
    }
  }

  // ============================================================================
  // SPINNER METHODS
  // ============================================================================

  /**
   * Start an infinite spinner
   */
  public startSpinner(message: string): void {
    this.spinner.start(message);
  }

  /**
   * Update spinner message
   */
  public updateSpinner(message: string): void {
    this.spinner.updateMessage(message);
  }

  /**
   * Stop the spinner
   */
  public stopSpinner(): void {
    this.spinner.stop();
  }

  /**
   * Stop spinner with success message
   * @alias spinnerSucceed (deprecated, use spinnerStop)
   */
  public spinnerStop(message?: string): void {
    this.spinner.succeed(message);
    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.SUCCESS, message ?? '');
    }
  }

  /**
   * Stop spinner with success message
   * @deprecated Use spinnerStop instead
   */
  public spinnerSucceed(message?: string): void {
    this.spinnerStop(message);
  }

  /**
   * Stop spinner with error
   */
  public spinnerFail(message?: string): void {
    this.spinner.fail(message);
    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.ERROR, message ?? '');
    }
  }

  /**
   * Stop spinner with warning
   */
  public spinnerWarn(message?: string): void {
    this.spinner.warn(message);
    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.WARNING, message ?? '');
    }
  }

  /**
   * Stop spinner with info
   */
  public spinnerInfo(message?: string): void {
    this.spinner.info(message);
    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, message ?? '');
    }
  }

  // ============================================================================
  // MULTI-SPINNER METHODS (for concurrent task tracking)
  // ============================================================================

  /**
   * Start or update a specific spinner task
   * @param id Unique task identifier
   * @param text Display text for this task
   */
  public spin(id: string, text: string): void {
    this.spinner.spin(id, text);
    // No logging - too verbose for updates
  }

  /**
   * Complete a task with success
   * @param id Task identifier
   * @param text Final message (optional)
   */
  public spinSucceed(id: string, text?: string): void {
    this.spinner.succeed(id, text);
    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.SUCCESS, text ?? id);
    }
  }

  /**
   * Complete a task with failure
   * @param id Task identifier
   * @param text Final message (optional)
   */
  public spinFail(id: string, text?: string): void {
    this.spinner.fail(id, text);
    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.ERROR, text ?? id);
    }
  }

  /**
   * Complete a task with warning
   * @param id Task identifier
   * @param text Final message (optional)
   */
  public spinWarn(id: string, text?: string): void {
    this.spinner.warn(id, text);
    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.WARNING, text ?? id);
    }
  }

  /**
   * Complete a task with info
   * @param id Task identifier
   * @param text Final message (optional)
   */
  public spinInfo(id: string, text?: string): void {
    this.spinner.info(id, text);
    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, text ?? id);
    }
  }

  /**
   * Remove a task without logging (silent removal)
   * @param id Task identifier
   */
  public spinRemove(id: string): void {
    this.spinner.remove(id);
    // No logging - silent removal by design
  }

  /**
   * Log a message above spinners
   * @param message Message to log
   */
  public spinLog(message: string): void {
    this.spinner.log(message);
    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, message);
    }
  }

  // ============================================================================
  // LOADING BAR METHODS
  // ============================================================================

  /**
   * Start a loading bar
   */
  public startLoading(message: string): void {
    this.loadingBar.start(message);
    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, message);
    }
  }

  /**
   * Update loading bar progress
   * @param percentage - Progress percentage (0-100)
   * @param message - Optional message update
   */
  public updateLoading(percentage: number, message?: string): void {
    this.loadingBar.update(percentage, message);
  }

  /**
   * Complete the loading bar (100%)
   */
  public completeLoading(message?: string): void {
    this.loadingBar.complete(message);
    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.SUCCESS, message ?? 'Loading completed');
    }
  }

  /**
   * Fail the loading bar
   */
  public failLoading(message?: string): void {
    this.loadingBar.fail(message);
    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.ERROR, message ?? 'Loading failed');
    }
  }

  /**
   * Stop the loading bar
   */
  public stopLoading(): void {
    this.loadingBar.stop();
  }

  // ============================================================================
  // USER INPUT PROMPTS
  // ============================================================================

  /**
   * Ask for text input
   */
  public async text(message: string, options?: GOPromptTextOptions): Promise<string | undefined> {
    const value = await this.runPrompt(async () =>
      this.promptAdapter.text({
        message: message,
        ...(options?.initial !== undefined ? { default: options.initial } : {}),
        ...(options?.validate !== undefined ? { validate: options.validate } : {}),
      }),
    );

    if (value !== undefined && this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${value}`);
    }

    return value;
  }

  /**
   * Ask for password input (hidden)
   */
  public async password(message: string, options?: GOPromptTextOptions): Promise<string | undefined> {
    const value = await this.runPrompt(async () =>
      this.promptAdapter.password({
        message: message,
        ...(options?.initial !== undefined ? { default: options.initial } : {}),
        ...(options?.validate !== undefined ? { validate: options.validate } : {}),
      }),
    );

    if (value !== undefined && this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, `${message} → [hidden]`);
    }

    return value;
  }

  /**
   * Ask for number input
   */
  public async number(message: string, options?: GOPromptNumberOptions): Promise<number | undefined> {
    const value = await this.runPrompt(async () =>
      this.promptAdapter.number({
        message: message,
        ...(options?.initial !== undefined ? { default: options.initial } : {}),
        validate: (value) => {
          if (value === undefined) return 'Value is required';
          if (options?.min !== undefined && value < options.min) return `Value must be >= ${String(options.min)}`;
          if (options?.max !== undefined && value > options.max) return `Value must be <= ${String(options.max)}`;
          return options?.validate?.(value) ?? true;
        },
      }),
    );

    if (value !== undefined && this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${value}`);
    }

    return value;
  }

  /**
   * Ask for a date, accepting far more than ISO 8601
   *
   * Typing a timestamp by hand is error prone, so the answer goes through
   * `parseDateInput`: keywords (`now`, `today`, `yesterday`, and their Italian
   * spellings), offsets from now (`-7d`, `-24h`), calendar days in either
   * `2026-08-24` or `24/08/2026` order, epoch seconds or milliseconds, and ISO
   * 8601 itself. An `initial` value is prefilled and editable, which is usually
   * enough to remind the user of the shape expected.
   *
   * A day with no time of day resolves to the edge named by `boundary`, so a
   * period asked as two questions covers the whole of its last day.
   *
   * @param message - Question shown to the user
   * @param options - Prefilled value, time zone, boundary, bounds and validation
   * @returns The chosen instant, or `undefined` when cancelled or left empty
   * @throws Error when a prompt adapter returns an answer its own validation should have rejected
   *
   * @example
   * ```typescript
   * const from = await prompt.date('Start date', { initial: new Date(), boundary: 'start' });
   * ```
   */
  public async date(message: string, options?: GOPromptDateOptions): Promise<Date | undefined> {
    const parseOptions = toDateInputOptions(options);
    const initial = formatInitialDate(options?.initial);

    const value = await this.runPrompt(async () =>
      this.promptAdapter.text({
        message: message,
        ...(initial !== undefined ? { default: initial } : {}),
        validate: (answer) => validateDateAnswer(answer, options, parseOptions),
      }),
    );

    if (value === undefined || value.trim().length === 0) {
      return undefined;
    }

    const parsed = parseDateInput(value, parseOptions);

    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${parsed.iso}`);
    }

    return parsed.date;
  }

  /**
   * Ask for a period, offering presets before asking for explicit bounds
   *
   * Most answers are a well-known window, so the user picks one from a list and
   * never types a date at all. The `custom` preset falls back to two `date`
   * questions, the second bounded by the first so an inverted range is refused
   * where it is typed rather than downstream.
   *
   * @param message - Question shown above the preset list
   * @param options - Presets, time zone, reference instant and bound messages
   * @returns The chosen period, where a missing bound means unbounded, or
   * `undefined` when the preset selection is cancelled
   *
   * @example
   * ```typescript
   * const period = await prompt.dateRange('Analysis period');
   * const from = period?.from?.toISOString() ?? '';
   * ```
   */
  public async dateRange(message: string, options?: GOPromptDateRangeOptions): Promise<GOPromptDateRange | undefined> {
    const timeZone = options?.timeZone ?? 'UTC';
    const now = options?.now ?? new Date();
    const presets = options?.presets ?? GO_DEFAULT_DATE_RANGE_PRESETS;

    const index = await this.select<number>(
      message,
      presets.map((preset, position) => ({ title: preset.title, value: position })),
    );
    if (index === undefined) return undefined;

    const preset = presets[index];
    if (preset === undefined) return undefined;

    if (preset.custom !== true) {
      return {
        ...(preset.from !== undefined ? { from: preset.from(now, timeZone) } : {}),
        ...(preset.to !== undefined ? { to: preset.to(now, timeZone) } : {}),
      };
    }

    const from = await this.date(options?.fromMessage ?? 'Start date (empty = no limit)', {
      timeZone,
      boundary: 'start',
      allowEmpty: true,
      now,
    });

    const to = await this.date(options?.toMessage ?? 'End date (empty = no limit)', {
      timeZone,
      boundary: 'end',
      allowEmpty: true,
      now,
      ...(from !== undefined ? { min: from } : {}),
    });

    return {
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
    };
  }

  /**
   * Ask for yes/no confirmation
   */
  public async confirm(
    message: string,
    initialOrOptions?: boolean | GOPromptConfirmOptions,
  ): Promise<boolean | undefined> {
    const options: GOPromptConfirmOptions =
      typeof initialOrOptions === 'object'
        ? initialOrOptions
        : initialOrOptions !== undefined
          ? { initial: initialOrOptions }
          : {};

    const value = await this.runPrompt(async () =>
      this.promptAdapter.confirm({
        message: message,
        ...(options.initial !== undefined ? { default: options.initial } : {}),
      }),
    );

    if (value !== undefined && this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${value ? 'Yes' : 'No'}`);
    }

    return value;
  }

  /**
   * Ask to select one option from a list
   */
  public async select<T = unknown>(message: string, choices: GOPromptSelectOption[]): Promise<T | undefined> {
    const value = await this.runPrompt(async () =>
      this.promptAdapter.select<T>({
        message: message,
        choices: choices.map((choice) => ({
          name: choice.title,
          value: choice.value as T,
          ...(choice.description !== undefined ? { description: choice.description } : {}),
        })),
      }),
    );

    if (value !== undefined && this.logger && this.logResponses) {
      const selected = choices.find((c) => c.value === value);
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${selected?.title ?? valueToString(value)}`);
    }

    return value;
  }

  /**
   * Ask to select multiple options from a list
   */
  public async multiselect<T = unknown>(
    message: string,
    choices: GOPromptMultiselectOption[],
  ): Promise<T[] | undefined> {
    const value = await this.runPrompt(async () =>
      this.promptAdapter.checkbox<T>({
        message: message,
        choices: choices.map((choice) => ({
          name: choice.title,
          value: choice.value as T,
          checked: choice.selected ?? false,
          ...(choice.description !== undefined ? { description: choice.description } : {}),
        })),
      }),
    );

    if (value !== undefined && this.logger && this.logResponses) {
      const selected = choices.filter((c) => value.includes(c.value as T));
      const titles = selected.map((s) => s.title).join(', ');
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${titles || 'None'}`);
    }

    return value;
  }

  /**
   * Ask for autocomplete text input
   */
  public async autocomplete<T = string>(
    message: string,
    choices: GOPromptSelectOption[] | string[],
    options: GOPromptAutocompleteOptions = {},
  ): Promise<T | undefined> {
    const formattedChoices: GOPromptSelectOption[] = choices.map((choice) =>
      typeof choice === 'string' ? { title: choice, value: choice } : choice,
    );
    const suggest = options.suggest;
    const searchOptions: GOPromptSelectInputOptions<T> = {
      message: message,
      choices: formattedChoices.map((choice) => ({
        name: choice.title,
        value: choice.value as T,
        ...(choice.description !== undefined ? { description: choice.description } : {}),
      })),
      pageSize: options.limit ?? 10,
      ...(suggest !== undefined
        ? {
            source: async (term) => {
              const sourceChoices = formattedChoices.map((choice) => ({
                name: choice.title,
                value: choice.value,
                ...(choice.description !== undefined ? { description: choice.description } : {}),
              }));
              const suggested = await suggest(term ?? '', toGOPromptSelectOptions(sourceChoices));
              return suggested.map((choice) => ({
                name: choice.title,
                value: choice.value as T,
                ...(choice.description !== undefined ? { description: choice.description } : {}),
              }));
            },
          }
        : {}),
    };

    const value = await this.runPrompt(async () => this.promptAdapter.search<T>(searchOptions));

    if (value !== undefined && this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${valueToString(value)}`);
    }

    return value;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Check if spinner is active
   */
  public isSpinnerActive(): boolean {
    return this.spinner.isActive();
  }

  /**
   * Set spinner indentation
   */
  public setSpinnerIndent(indent: string | number): void {
    this.spinner.setIndent(indent);
  }

  /**
   * Check if loading bar is active
   */
  public isLoadingActive(): boolean {
    return this.loadingBar.isActive();
  }
}
