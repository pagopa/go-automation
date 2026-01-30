/**
 * Console Logger Style Configuration
 * Defines visual formatting for console log output
 */

import { DateTime } from 'luxon';

import { GOLogEvent } from '../GOLogEvent.js';
import { GOLogEventCategory } from '../GOLogEventCategory.js';

/**
 * ANSI color codes for terminal output
 */
export class ConsoleColors {
  static readonly RESET = '\x1b[0m';
  static readonly BRIGHT = '\x1b[1m';
  static readonly DIM = '\x1b[2m';

  // Foreground colors
  static readonly BLACK = '\x1b[30m';
  static readonly RED = '\x1b[31m';
  static readonly GREEN = '\x1b[32m';
  static readonly YELLOW = '\x1b[33m';
  static readonly BLUE = '\x1b[34m';
  static readonly MAGENTA = '\x1b[35m';
  static readonly CYAN = '\x1b[36m';
  static readonly WHITE = '\x1b[37m';
  static readonly GRAY = '\x1b[90m';

  // Background colors
  static readonly BG_BLACK = '\x1b[40m';
  static readonly BG_RED = '\x1b[41m';
  static readonly BG_GREEN = '\x1b[42m';
  static readonly BG_YELLOW = '\x1b[43m';
  static readonly BG_BLUE = '\x1b[44m';
  static readonly BG_MAGENTA = '\x1b[45m';
  static readonly BG_CYAN = '\x1b[46m';
  static readonly BG_WHITE = '\x1b[47m';
}

/**
 * Category style configuration
 */
export interface CategoryStyle {
  /** Text prefix */
  prefix?: string;

  /** Text suffix */
  suffix?: string;

  /** ANSI color codes */
  color?: string;

  /** Format template with placeholders */
  format: string;
}

/**
 * Default style used as fallback when category style is not found
 */
const DEFAULT_STYLE: CategoryStyle = {
  color: ConsoleColors.WHITE,
  format: '{prefix}{message}',
  prefix: '→ ',
};

/**
 * Console logger style configuration
 */
export class GOConsoleLoggerStyle {
  private readonly styles: Map<GOLogEventCategory, CategoryStyle>;

  constructor() {
    this.styles = new Map([
      [
        GOLogEventCategory.HEADER,
        { color: ConsoleColors.BRIGHT + ConsoleColors.CYAN, format: '{prefix}{message}{suffix}' },
      ],
      [
        GOLogEventCategory.SECTION,
        {
          color: ConsoleColors.BRIGHT + ConsoleColors.BLUE,
          format: '\n{prefix}{message}',
          prefix: '⏵ ',
        },
      ],
      [
        GOLogEventCategory.STEP,
        { color: ConsoleColors.WHITE, format: '{prefix}{message}', prefix: '→ ' },
      ],
      [GOLogEventCategory.TEXT, { color: ConsoleColors.WHITE, format: '{message}' }],
      [
        GOLogEventCategory.SUCCESS,
        { color: ConsoleColors.GREEN, format: '{prefix}{message}', prefix: '✓ ' },
      ],
      [
        GOLogEventCategory.ERROR,
        { color: ConsoleColors.RED, format: '{prefix}{message}', prefix: '✗ ERROR: ' },
      ],
      [
        GOLogEventCategory.FATAL,
        { color: ConsoleColors.RED, format: '{prefix}{message}', prefix: '✗ FATAL: ' },
      ],
      [
        GOLogEventCategory.WARNING,
        { color: ConsoleColors.YELLOW, format: '{prefix}{message}', prefix: '⚠ WARNING: ' },
      ],
      [
        GOLogEventCategory.INFO,
        { color: ConsoleColors.MAGENTA, format: '{prefix}{message}', prefix: 'ℹ ' },
      ],
    ]);
  }

  /**
   * Get style for a category
   */
  public getStyle(category: GOLogEventCategory): CategoryStyle {
    return this.styles.get(category) ?? DEFAULT_STYLE;
  }

  /**
   * Set custom style for a category
   */
  public setStyle(category: GOLogEventCategory, style: CategoryStyle): void {
    this.styles.set(category, style);
  }

  /**
   * Format a log event using the style configuration
   */
  public format(event: GOLogEvent, indent: string = ''): string {
    const style = this.getStyle(event.category);
    let formatted = style.format;

    // Replace placeholders
    const timestamp = DateTime.fromJSDate(event.timestamp).toFormat('yyyy-MM-dd HH:mm:ss.SSS');
    formatted = formatted
      .replace('{prefix}', style.prefix ?? '')
      .replace('{suffix}', style.suffix ?? '')
      .replace('{message}', event.message)
      .replace('{timestamp}', timestamp);

    // Apply indentation
    formatted = indent + formatted;

    // Apply color
    if (style.color) {
      formatted = style.color + formatted + ConsoleColors.RESET;
    }

    return formatted;
  }
}
