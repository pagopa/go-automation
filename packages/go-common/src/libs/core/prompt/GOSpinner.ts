/**
 * GOSpinner - Infinite spinner animation
 * Shows a rotating spinner until stopped
 */

import * as readline from 'readline';

export class GOSpinner {
  private frames: string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame: number = 0;
  private interval?: NodeJS.Timeout | undefined;
  private message: string = '';
  private isRunning: boolean = false;
  private indent: string = '';

  /**
   * Start the spinner with a message
   */
  public start(message: string): void {
    if (this.isRunning) {
      this.stop();
    }

    this.message = message;
    this.isRunning = true;
    this.currentFrame = 0;

    // Hide cursor
    process.stdout.write('\x1B[?25l');

    // Start animation
    this.interval = setInterval(() => {
      this.render();
    }, 80);

    // Initial render
    this.render();
  }

  /**
   * Update the spinner message without stopping it
   */
  public updateMessage(message: string): void {
    this.message = message;
    if (this.isRunning) {
      this.render();
    }
  }

  /**
   * Set the indentation for the spinner
   */
  public setIndent(indent: string | number): void {
    this.indent = typeof indent === 'number' ? ' '.repeat(indent) : indent;
    if (this.isRunning) {
      this.render();
    }
  }

  /**
   * Stop the spinner
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }

    // Clear the line
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    // Show cursor
    process.stdout.write('\x1B[?25h');
  }

  /**
   * Stop the spinner and show a success message
   */
  public succeed(message?: string): void {
    this.stop();
    const finalMessage = message || this.message;
    console.log(`${this.indent}\x1b[32m✓\x1b[0m ${finalMessage}`);
  }

  /**
   * Stop the spinner and show an error message
   */
  public fail(message?: string): void {
    this.stop();
    const finalMessage = message || this.message;
    console.log(`${this.indent}\x1b[31m✗\x1b[0m ${finalMessage}`);
  }

  /**
   * Stop the spinner and show a warning message
   */
  public warn(message?: string): void {
    this.stop();
    const finalMessage = message || this.message;
    console.log(`${this.indent}\x1b[33m⚠\x1b[0m ${finalMessage}`);
  }

  /**
   * Stop the spinner and show an info message
   */
  public info(message?: string): void {
    this.stop();
    const finalMessage = message || this.message;
    console.log(`${this.indent}\x1b[36mℹ\x1b[0m ${finalMessage}`);
  }

  /**
   * Render the current frame
   */
  private render(): void {
    const frame = this.frames[this.currentFrame];
    this.currentFrame = (this.currentFrame + 1) % this.frames.length;

    // Clear line and move cursor to start
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    // Write indentation, spinner and message
    process.stdout.write(`${this.indent}\x1b[36m${frame}\x1b[0m ${this.message}`);
  }

  /**
   * Check if spinner is running
   */
  public isActive(): boolean {
    return this.isRunning;
  }
}
