/**
 * File Logger Style Configuration
 * Defines formatting for file log output
 */

import { DateTime } from 'luxon';

import { GOLogEvent } from '../GOLogEvent.js';
import { GOLogEventCategory } from '../GOLogEventCategory.js';

/**
 * Category style configuration for file output
 */
export interface FileCategoryStyle {
  /** Text prefix */
  prefix?: string;

  /** Text suffix */
  suffix?: string;

  /** Format template with placeholders */
  format: string;
}

/**
 * File logger style configuration
 */
export class GOFileLoggerStyle {
  private readonly styles: Map<GOLogEventCategory, FileCategoryStyle>;

  constructor() {
    this.styles = new Map([
      [
        GOLogEventCategory.HEADER,
        {
          format: '[{timestamp}] [HEADER] {prefix}{message}{suffix}',
          prefix: '=== ',
          suffix: ' ===',
        },
      ],
      [
        GOLogEventCategory.SECTION,
        {
          format: '[{timestamp}] [SECTION] {prefix}{message}{suffix}',
          prefix: '--- ',
          suffix: ' ---',
        },
      ],
      [GOLogEventCategory.STEP, { format: '[{timestamp}] [STEP] {message}' }],
      [GOLogEventCategory.SUCCESS, { format: '[{timestamp}] [SUCCESS] {message}' }],
      [GOLogEventCategory.ERROR, { format: '[{timestamp}] [ERROR] {message}' }],
      [GOLogEventCategory.FATAL, { format: '[{timestamp}] [FATAL] {message}' }],
      [GOLogEventCategory.WARNING, { format: '[{timestamp}] [WARNING] {message}' }],
      [GOLogEventCategory.INFO, { format: '[{timestamp}] [INFO] {message}' }],
      [GOLogEventCategory.TEXT, { format: '[{timestamp}] {message}' }],
    ]);
  }

  /**
   * Get style for a category
   */
  public getStyle(category: GOLogEventCategory): FileCategoryStyle {
    const defaultStyle = this.styles.get(GOLogEventCategory.STEP);
    return this.styles.get(category) ?? defaultStyle ?? { format: '[{timestamp}] {message}' };
  }

  /**
   * Set custom style for a category
   */
  public setStyle(category: GOLogEventCategory, style: FileCategoryStyle): void {
    this.styles.set(category, style);
  }

  /**
   * Format a log event using the style configuration
   */
  public format(event: GOLogEvent): string {
    const style = this.getStyle(event.category);
    let formatted = style.format;

    // Format timestamp with local timezone (using luxon)
    const maybeDate = DateTime.fromJSDate(event.timestamp);
    const timestamp = maybeDate.toFormat('yyyy-MM-dd HH:mm:ss.SSS');

    // Strip ANSI codes from message before writing to file
    const cleanMessage = this.stripAnsiCodes(event.message);

    // Replace placeholders
    formatted = formatted
      .replace('{prefix}', style.prefix ?? '')
      .replace('{suffix}', style.suffix ?? '')
      .replace('{message}', cleanMessage)
      .replace('{timestamp}', timestamp)
      .replace('{category}', event.category);

    return formatted;
  }

  /**
   * Remove ANSI escape codes (colors, styles) from text
   * This ensures clean output in log files without terminal control codes
   */
  private stripAnsiCodes(text: string): string {
    // Pattern matches ANSI escape sequences:
    // \x1b or \u001b - escape character
    // [ - start of CSI (Control Sequence Introducer)
    // [0-9;]* - parameters (numbers and semicolons)
    // [a-zA-Z] - final command character (m for colors, others for cursor movement, etc.)
    return text.replace(/\\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }
}
