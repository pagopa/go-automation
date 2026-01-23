/**
 * GOLoadingBar - Progress bar with percentage
 * Shows a progress bar with percentage completion
 */

import * as readline from 'readline';
import type { GOLoadingBarOptions } from './GOLoadingBarOptions.js';

export class GOLoadingBar {
  private width: number;
  private completeChar: string;
  private incompleteChar: string;
  private showPercentage: boolean;
  private showMessage: boolean;
  private message: string = '';
  private percentage: number = 0;
  private isRunning: boolean = false;

  constructor(options?: GOLoadingBarOptions) {
    this.width = options?.width ?? 40;
    this.completeChar = options?.completeChar ?? '█';
    this.incompleteChar = options?.incompleteChar ?? '░';
    this.showPercentage = options?.showPercentage ?? true;
    this.showMessage = options?.showMessage ?? true;
  }

  /**
   * Start the loading bar with a message
   */
  public start(message: string): void {
    if (this.isRunning) {
      this.stop();
    }

    this.message = message;
    this.percentage = 0;
    this.isRunning = true;

    // Hide cursor
    process.stdout.write('\x1B[?25l');

    // Initial render
    this.render();
  }

  /**
   * Update the progress percentage
   * @param percentage - Progress percentage (0-100)
   */
  public update(percentage: number, message?: string): void {
    if (!this.isRunning) {
      return;
    }

    this.percentage = Math.max(0, Math.min(100, percentage));
    if (message) {
      this.message = message;
    }

    this.render();
  }

  /**
   * Stop the loading bar
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Clear the line
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    // Show cursor
    process.stdout.write('\x1B[?25h');
  }

  /**
   * Complete the loading bar (set to 100% and stop)
   */
  public complete(message?: string): void {
    if (this.isRunning) {
      this.update(100, message);
      // Give a moment to see 100%
      setTimeout(() => {
        this.stop();
        const finalMessage = message || this.message;
        console.log(`\x1b[32m✓\x1b[0m ${finalMessage}`);
      }, 100);
    }
  }

  /**
   * Fail the loading bar and stop
   */
  public fail(message?: string): void {
    this.stop();
    const finalMessage = message || this.message;
    console.log(`\x1b[31m✗\x1b[0m ${finalMessage}`);
  }

  /**
   * Render the progress bar
   */
  private render(): void {
    // Calculate completed and incomplete sections
    const completeWidth = Math.round((this.percentage / 100) * this.width);
    const incompleteWidth = this.width - completeWidth;

    const completeSection = this.completeChar.repeat(completeWidth);
    const incompleteSection = this.incompleteChar.repeat(incompleteWidth);

    // Build the output
    let output = '';

    // Add message if enabled
    if (this.showMessage && this.message) {
      output += `${this.message} `;
    }

    // Add progress bar
    output += `\x1b[36m[\x1b[0m${completeSection}${incompleteSection}\x1b[36m]\x1b[0m`;

    // Add percentage if enabled
    if (this.showPercentage) {
      const percentageStr = this.percentage.toFixed(0).padStart(3, ' ');
      output += ` \x1b[36m${percentageStr}%\x1b[0m`;
    }

    // Clear line and move cursor to start
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    // Write output
    process.stdout.write(output);
  }

  /**
   * Check if loading bar is running
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get current percentage
   */
  public getPercentage(): number {
    return this.percentage;
  }
}
