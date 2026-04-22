/**
 * GOMultiSpinner - Multi-task spinner with single-spinner compatibility
 *
 * Supports both multi-spinner mode (multiple tasks) and single-spinner mode (backward compatible with GOSpinner)
 *
 * @example Multi-spinner mode
 * ```typescript
 * const spinner = new GOMultiSpinner();
 * spinner.spin('task1', 'Processing file 1...');
 * spinner.spin('task2', 'Processing file 2...');
 * spinner.succeed('task1', 'File 1 processed');
 * spinner.fail('task2', 'File 2 failed');
 * ```
 *
 * @example Single-spinner mode (backward compatible)
 * ```typescript
 * const spinner = new GOMultiSpinner();
 * spinner.start('Loading...');
 * spinner.update('Still loading...');
 * spinner.succeed('Done!');
 * ```
 */

import * as readline from 'readline';

import { GOExecutionEnvironment } from '../environment/GOExecutionEnvironment.js';

interface SpinnerTask {
  id: string;
  text: string;
  status: 'spinning';
}

export interface GOMultiSpinnerOptions {
  /** Spinner animation frames */
  frames?: string[];
  /** Animation interval in milliseconds */
  interval?: number;
  /** Default indentation */
  indent?: string | number;
  /** Color for spinner icon (ANSI color code) */
  spinnerColor?: string;
  /** Color for success symbol */
  successColor?: string;
  /** Color for error symbol */
  errorColor?: string;
  /** Color for warning symbol */
  warningColor?: string;
  /** Color for info symbol */
  infoColor?: string;
}

const DEFAULT_OPTIONS: Required<GOMultiSpinnerOptions> = {
  frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  interval: 80,
  indent: '',
  spinnerColor: '\x1b[36m', // Cyan
  successColor: '\x1b[32m', // Green
  errorColor: '\x1b[31m', // Red
  warningColor: '\x1b[33m', // Yellow
  infoColor: '\x1b[36m', // Cyan
};

export class GOMultiSpinner {
  private readonly tasks: Map<string, SpinnerTask> = new Map();
  private readonly frames: string[];
  private currentFrame: number = 0;
  private interval?: NodeJS.Timeout | undefined;
  private isRunning: boolean = false;
  private lastLineCount: number = 0;
  private indent: string = '';
  private readonly animationInterval: number;
  // In Lambda/CI/non-TTY, live spinners are useless (non-TTY) or actively harmful
  // (Lambda: setInterval keeps the event loop alive, ANSI escapes pollute CloudWatch).
  // Skip the animation loop in those environments and emit plain lines instead.
  private readonly nonInteractive: boolean = !GOExecutionEnvironment.isInteractive();

  // Colors
  private readonly spinnerColor: string;
  private readonly successColor: string;
  private readonly errorColor: string;
  private readonly warningColor: string;
  private readonly infoColor: string;

  // Single-spinner mode state (backward compatibility)
  private singleSpinnerMode: boolean = false;
  private readonly singleSpinnerId = '__single__';

  constructor(options?: GOMultiSpinnerOptions) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.frames = opts.frames;
    this.animationInterval = opts.interval;
    this.setIndent(opts.indent);
    this.spinnerColor = opts.spinnerColor;
    this.successColor = opts.successColor;
    this.errorColor = opts.errorColor;
    this.warningColor = opts.warningColor;
    this.infoColor = opts.infoColor;

    this.render = this.render.bind(this);
  }

  /**
   * Set indentation for all spinner output
   */
  public setIndent(indent: string | number): void {
    this.indent = typeof indent === 'number' ? ' '.repeat(indent) : indent;
  }

  // ==================== Multi-Spinner API ====================

  /**
   * Start or update a spinner task
   * @param id Unique task identifier
   * @param text Display text for this task
   */
  public spin(id: string, text: string): void {
    const isNew = !this.tasks.has(id);
    this.tasks.set(id, { id, text, status: 'spinning' });
    if (!this.isRunning) {
      this.startAnimation();
    }
    // In non-interactive mode the live animation is suppressed, so we emit a plain
    // start line the first time a task appears. This keeps CloudWatch logs informative.
    if (this.nonInteractive && isNew) {
      process.stdout.write(`${this.indent}${text}\n`);
    }
  }

  /**
   * Update a spinner task (alias for spin)
   * @param id Unique task identifier
   * @param text Updated display text
   */
  public update(id: string, text: string): void {
    this.spin(id, text);
  }

  /**
   * Remove a task without logging (silent removal)
   * @param id Task identifier
   */
  public remove(id: string): void {
    if (this.tasks.has(id)) {
      this.tasks.delete(id);
      if (this.tasks.size === 0) {
        this.stopAnimation();
      } else {
        this.render();
      }
    }
  }

  /**
   * Log a message above spinners without affecting them
   * @param message Message to log
   */
  public log(message: string): void {
    this.clear();
    process.stdout.write(`${this.indent}${message}\n`);
    this.lastLineCount = 0;
    if (this.tasks.size > 0) {
      this.render();
    }
  }

  // ==================== Single-Spinner API (Backward Compatible) ====================

  /**
   * Start single-spinner mode (backward compatible with GOSpinner)
   * @param message Spinner message
   */
  public start(message: string): void {
    // If already in single-spinner mode, stop first
    if (this.singleSpinnerMode) {
      this.stopSingle();
    }

    this.singleSpinnerMode = true;
    this.spin(this.singleSpinnerId, message);
  }

  /**
   * Update single-spinner message (backward compatible with GOSpinner)
   * @param message Updated message
   */
  public updateMessage(message: string): void {
    if (this.singleSpinnerMode) {
      this.spin(this.singleSpinnerId, message);
    }
  }

  /**
   * Stop single-spinner without message (backward compatible with GOSpinner)
   * @param message Optional final message to display
   */
  public stop(message?: string): void {
    if (this.singleSpinnerMode) {
      this.stopSingle(message);
    } else {
      this.stopAll();
    }
  }

  /**
   * Complete single-spinner with success (backward compatible with GOSpinner)
   * This is an overload that works in single-spinner mode
   * @param message Success message
   */
  public succeed(message?: string): void;
  /**
   * Complete a task with success (multi-spinner mode)
   * @param id Task identifier
   * @param text Final message (optional, uses current text if not provided)
   */
  public succeed(id: string, text?: string): void;
  public succeed(idOrMessage?: string, text?: string): void {
    const { id, text: finalText } = this.resolveIdAndText(idOrMessage, text);
    this.completeTask(id, finalText, 'success');
  }

  /**
   * Complete single-spinner with failure (backward compatible with GOSpinner)
   * This is an overload that works in single-spinner mode
   * @param message Failure message
   */
  public fail(message?: string): void;
  /**
   * Complete a task with failure (multi-spinner mode)
   * @param id Task identifier
   * @param text Final message (optional, uses current text if not provided)
   */
  public fail(id: string, text?: string): void;
  public fail(idOrMessage?: string, text?: string): void {
    const { id, text: finalText } = this.resolveIdAndText(idOrMessage, text);
    this.completeTask(id, finalText, 'fail');
  }

  /**
   * Complete single-spinner with warning (backward compatible with GOSpinner)
   * This is an overload that works in single-spinner mode
   * @param message Warning message
   */
  public warn(message?: string): void;
  /**
   * Complete a task with warning (multi-spinner mode)
   * @param id Task identifier
   * @param text Final message (optional, uses current text if not provided)
   */
  public warn(id: string, text?: string): void;
  public warn(idOrMessage?: string, text?: string): void {
    const { id, text: finalText } = this.resolveIdAndText(idOrMessage, text);
    this.completeTask(id, finalText, 'warn');
  }

  /**
   * Complete single-spinner with info (backward compatible with GOSpinner)
   * This is an overload that works in single-spinner mode
   * @param message Info message
   */
  public info(message?: string): void;
  /**
   * Complete a task with info (multi-spinner mode)
   * @param id Task identifier
   * @param text Final message (optional, uses current text if not provided)
   */
  public info(id: string, text?: string): void;
  public info(idOrMessage?: string, text?: string): void {
    const { id, text: finalText } = this.resolveIdAndText(idOrMessage, text);
    this.completeTask(id, finalText, 'info');
  }

  private stopSingle(message?: string): void {
    if (this.tasks.has(this.singleSpinnerId)) {
      this.tasks.delete(this.singleSpinnerId);
      this.clear();

      if (message) {
        process.stdout.write(`${this.indent}${message}\n`);
      }

      this.lastLineCount = 0;
      this.stopAnimation();
      this.singleSpinnerMode = false;
    }
  }

  // ==================== Common Methods ====================

  /**
   * Stop all spinners and clear display
   */
  public stopAll(): void {
    this.clear();
    this.tasks.clear();
    this.stopAnimation();
    this.singleSpinnerMode = false;
  }

  /**
   * Check if any spinners are active
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get count of active tasks
   */
  public getActiveCount(): number {
    return this.tasks.size;
  }

  // ==================== Private Methods ====================

  /**
   * Resolve task ID and text based on current mode.
   * In single-spinner mode with only one argument, treat it as message.
   * Otherwise, treat first arg as ID (defaults to singleSpinnerId).
   */
  private resolveIdAndText(
    idOrMessage: string | undefined,
    text: string | undefined,
  ): { id: string; text: string | undefined } {
    // In single-spinner mode with only one argument, treat it as message
    if (this.singleSpinnerMode && text === undefined) {
      return { id: this.singleSpinnerId, text: idOrMessage };
    }
    // Otherwise treat first arg as id (default to singleSpinnerId if not provided)
    return { id: idOrMessage ?? this.singleSpinnerId, text };
  }

  private completeTask(id: string, text: string | undefined, status: 'success' | 'fail' | 'warn' | 'info'): void {
    const task = this.tasks.get(id);
    if (!task) return;

    const finalText = text ?? task.text;
    this.tasks.delete(id);
    this.clear();

    let symbol: string;
    switch (status) {
      case 'success':
        symbol = `${this.successColor}✔︎\x1b[0m`;
        break;
      case 'fail':
        symbol = `${this.errorColor}✖︎\x1b[0m`;
        break;
      case 'warn':
        symbol = `${this.warningColor}⚠\x1b[0m`;
        break;
      case 'info':
        symbol = `${this.infoColor}ℹ\x1b[0m`;
        break;
      default:
        symbol = `${this.infoColor}\x1b[0m`;
        break;
    }

    process.stdout.write(`${this.indent}${symbol} ${finalText}\n`);
    this.lastLineCount = 0;

    if (this.tasks.size === 0) {
      this.stopAnimation();
      if (id === this.singleSpinnerId) {
        this.singleSpinnerMode = false;
      }
    } else {
      this.render();
    }
  }

  private startAnimation(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    // In non-interactive environments (Lambda, CI, piped output) skip the
    // ANSI cursor toggle and the setInterval-based render loop entirely.
    // setInterval would keep the Lambda event loop alive and delay handler return.
    if (this.nonInteractive) {
      return;
    }
    process.stdout.write('\x1B[?25l'); // Hide cursor
    this.interval = setInterval(() => this.render(), this.animationInterval);
    this.render();
  }

  private stopAnimation(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.nonInteractive) {
      // No interval to clear, no cursor to restore.
      this.lastLineCount = 0;
      return;
    }
    this.clear();
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    process.stdout.write('\x1B[?25h'); // Show cursor
    this.lastLineCount = 0;
  }

  private clear(): void {
    // readline.moveCursor / clearScreenDown require a TTY; they are no-ops on a
    // non-TTY stream in Node but we avoid the call anyway to keep CloudWatch clean.
    if (this.nonInteractive) return;
    if (this.lastLineCount > 0) {
      readline.moveCursor(process.stdout, 0, -this.lastLineCount);
      readline.clearScreenDown(process.stdout);
    }
  }

  private render(): void {
    // No live frames in non-interactive environments.
    if (this.nonInteractive) return;

    this.clear();

    const frame = this.frames[this.currentFrame];
    this.currentFrame = (this.currentFrame + 1) % this.frames.length;

    let output = '';
    let count = 0;

    for (const [, task] of this.tasks) {
      const maxWidth = process.stdout.columns ? process.stdout.columns - this.indent.length - 3 : 80;
      let text = task.text;
      if (text.length > maxWidth) {
        text = `${text.substring(0, maxWidth - 3)}...`;
      }
      output += `${this.indent}${this.spinnerColor}${frame}\x1b[0m ${text}\n`;
      count++;
    }

    if (output.length > 0) {
      process.stdout.write(output);
    }

    this.lastLineCount = count;
  }
}
