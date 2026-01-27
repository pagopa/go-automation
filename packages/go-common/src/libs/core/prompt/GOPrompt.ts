/**
 * GOPrompt - Unified prompt system
 * Integrates spinner, loading bar, and user input prompts
 */

import prompts from 'prompts';

import { GOLogEventCategory } from '../logging/GOLogEventCategory.js';
import { GOLogger } from '../logging/GOLogger.js';

import { GOLoadingBar } from './GOLoadingBar.js';
import { GOMultiSpinner } from './GOMultiSpinner.js';

export interface GOPromptTextOptions {
  /** Default value */
  initial?: string;

  /** Validation function */
  validate?: (value: string) => boolean | string;
}

export interface GOPromptNumberOptions {
  /** Default value */
  initial?: number;

  /** Minimum value */
  min?: number;

  /** Maximum value */
  max?: number;

  /** Validation function */
  validate?: (value: number) => boolean | string;
}

export interface GOPromptSelectOption {
  /** Option title */
  title: string;

  /** Option value */
  value: unknown;

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

/**
 * Unified prompt system with spinner, loading, and user input
 */
export class GOPrompt {
  private readonly spinner: GOMultiSpinner;
  private readonly loadingBar: GOLoadingBar;
  private readonly logger: GOLogger;
  private readonly logResponses: boolean;

  constructor(logger: GOLogger, logResponses: boolean = false) {
    this.logger = logger;
    this.spinner = new GOMultiSpinner();
    this.loadingBar = new GOLoadingBar();
    this.logResponses = logResponses;
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
  public async text(message: string, options?: GOPromptTextOptions): Promise<string> {
    const response = await prompts({
      type: 'text',
      name: 'value',
      message: message,
      initial: options?.initial,
      validate: options?.validate,
    });

    const value = (response.value as string) ?? '';

    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${value}`);
    }

    return value;
  }

  /**
   * Ask for password input (hidden)
   */
  public async password(message: string, options?: GOPromptTextOptions): Promise<string> {
    const response = await prompts({
      type: 'password',
      name: 'value',
      message: message,
      initial: options?.initial,
      validate: options?.validate,
    });

    const value = (response.value as string) ?? '';

    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, `${message} → [hidden]`);
    }

    return value;
  }

  /**
   * Ask for number input
   */
  public async number(message: string, options?: GOPromptNumberOptions): Promise<number> {
    const response = await prompts({
      type: 'number',
      name: 'value',
      message: message,
      initial: options?.initial,
      min: options?.min,
      max: options?.max,
      validate: options?.validate,
    });

    const value = (response.value as number) ?? 0;

    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${value}`);
    }

    return value;
  }

  /**
   * Ask for yes/no confirmation
   */
  public async confirm(message: string, initial: boolean = false): Promise<boolean> {
    const response = await prompts({
      type: 'toggle',
      name: 'value',
      message: message,
      initial: initial,
      active: 'yes',
      inactive: 'no',
    });

    const value = (response.value as boolean) ?? false;

    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${value ? 'Yes' : 'No'}`);
    }

    return value;
  }

  /**
   * Ask to select one option from a list
   */
  public async select<T = unknown>(
    message: string,
    choices: GOPromptSelectOption[],
  ): Promise<T | undefined> {
    const response = await prompts({
      type: 'select',
      name: 'value',
      message: message,
      choices: choices.map((choice) => ({
        title: choice.title,
        value: choice.value,
        description: choice.description,
      })),
    });

    const value = response.value as T;

    if (this.logger && this.logResponses) {
      const selected = choices.find((c) => c.value === value);
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${selected?.title ?? String(value)}`);
    }

    return value;
  }

  /**
   * Ask to select multiple options from a list
   */
  public async multiselect<T = unknown>(
    message: string,
    choices: GOPromptMultiselectOption[],
  ): Promise<T[]> {
    const response = await prompts({
      type: 'multiselect',
      name: 'value',
      message: message,
      choices: choices.map((choice) => ({
        title: choice.title,
        value: choice.value,
        selected: choice.selected ?? false,
        description: choice.description,
      })),
    });

    const values = response.value ?? [];

    if (this.logger && this.logResponses) {
      const selected = choices.filter((c) => values.includes(c.value));
      const titles = selected.map((s) => s.title).join(', ');
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${titles || 'None'}`);
    }

    return values;
  }

  /**
   * Ask for autocomplete text input
   */
  public async autocomplete(message: string, choices: string[], initial?: string): Promise<string> {
    const response = await prompts({
      type: 'autocomplete',
      name: 'value',
      message: message,
      initial: initial,
      choices: choices.map((choice) => ({ title: choice, value: choice })),
    });

    const value = response.value ?? '';

    if (this.logger && this.logResponses) {
      this.logger.log(GOLogEventCategory.INFO, `${message} → ${value}`);
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
