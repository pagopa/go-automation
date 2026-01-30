/**
 * GOLogger - Main logging class
 * Manages multiple log handlers and distributes log events
 */

import { GOLogEvent } from './GOLogEvent.js';
import { GOLogEventCategory } from './GOLogEventCategory.js';
import type { GOLoggerHandler } from './GOLoggerHandler.js';
import { GOTableFormatter } from './GOTableFormatter.js';
import type { GOTableOptions, GOTableColumn } from './GOTableFormatter.js';
import { valueToString } from '../utils/GOValueToString.js';

/**
 * Main logger class
 * Accepts log events and distributes them to all registered handlers
 */
export class GOLogger {
  private readonly handlers: GOLoggerHandler[] = [];

  /**
   * Create a logger with optional initial handlers
   */
  constructor(handlers?: GOLoggerHandler[]) {
    if (handlers) {
      this.handlers = [...handlers];
    }
  }

  /**
   * Register a new handler
   */
  public registerHandler(handler: GOLoggerHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Unregister a handler
   */
  public unregisterHandler(handler: GOLoggerHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index !== -1) {
      this.handlers.splice(index, 1);
    }
  }

  /**
   * Get all registered handlers
   */
  public getHandlers(): GOLoggerHandler[] {
    return [...this.handlers];
  }

  /**
   * Log an event to all handlers
   * Can accept either a GOLogEvent instance or category and message
   */
  public log(eventOrCategory: GOLogEvent | GOLogEventCategory, message?: string): void {
    let event: GOLogEvent;

    if (eventOrCategory instanceof GOLogEvent) {
      event = eventOrCategory;
    } else if (message !== undefined) {
      event = new GOLogEvent(message, eventOrCategory);
    } else {
      throw new Error(
        'Invalid log arguments: must provide either GOLogEvent or (category, message)',
      );
    }

    // Distribute to all handlers
    for (const handler of this.handlers) {
      handler.handle(event);
    }
  }

  /**
   * Log a plain text message
   */
  public text(message: string): void {
    this.log(GOLogEvent.text(message));
  }

  /**
   * Log a newline message
   */
  public newline(): void {
    this.log(GOLogEvent.newline());
  }

  /**
   * Log a step message
   */
  public step(message: string): void {
    this.log(GOLogEvent.step(message));
  }

  /**
   * Log a success message
   */
  public success(message: string): void {
    this.log(GOLogEvent.success(message));
  }

  /**
   * Log an error message
   */
  public error(message: string): void {
    this.log(GOLogEvent.error(message));
  }

  /**
   * Log a fatal error message
   */
  public fatal(message: string): void {
    this.log(GOLogEvent.fatal(message));
  }

  /**
   * Log a warning message
   */
  public warning(message: string): void {
    this.log(GOLogEvent.warning(message));
  }

  /**
   * Log a header message
   */
  public header(message: string): void {
    this.log(GOLogEvent.header(message));
  }

  /**
   * Log an info message
   */
  public info(message: string): void {
    this.log(GOLogEvent.info(message));
  }

  /**
   * Log a section message
   */
  public section(message: string): void {
    this.log(GOLogEvent.section(message));
  }

  /**
   * Reset all handlers
   */
  public async reset(): Promise<void> {
    for (const handler of this.handlers) {
      await handler.reset();
    }
  }

  /**
   * Log a formatted table
   *
   * @example
   * ```typescript
   * logger.table({
   *   columns: [
   *     { header: 'Name', key: 'name', width: 20 },
   *     { header: 'Age', key: 'age', width: 10, align: 'right' },
   *     { header: 'City', key: 'city' }
   *   ],
   *   data: [
   *     { name: 'Alice', age: 30, city: 'Rome' },
   *     { name: 'Bob', age: 25, city: 'Milan' }
   *   ]
   * });
   * ```
   */
  public table(options: GOTableOptions): void {
    const formatter = new GOTableFormatter(options);
    const tableString = formatter.format();

    // Log each line separately to maintain proper formatting
    const lines = tableString.split('\n');
    for (const line of lines) {
      this.log(GOLogEvent.text(line));
    }
  }

  /**
   * Helper: Create a simple table from array of objects
   * Auto-detects columns from first object
   *
   * @example
   * ```typescript
   * logger.simpleTable([
   *   { name: 'Alice', age: 30 },
   *   { name: 'Bob', age: 25 }
   * ]);
   * ```
   */
  public simpleTable(data: Record<string, unknown>[], options?: Partial<GOTableOptions>): void {
    if (data.length === 0) {
      this.warning('No data to display in table');
      return;
    }

    // Auto-detect columns from first row
    const firstRow = data[0];
    if (!firstRow) {
      return;
    }
    const columns: GOTableColumn[] = Object.keys(firstRow).map((key) => ({
      header: this.capitalizeFirstLetter(key),
      key: key,
    }));

    this.table({
      ...options,
      columns,
      data,
    } as GOTableOptions);
  }

  /**
   * Helper: Create a key-value table (2 columns)
   * Useful for configuration display
   *
   * @example
   * ```typescript
   * logger.keyValueTable({
   *   'Profile': 'my-profile',
   *   'Region': 'eu-south-1',
   *   'Start Date': '2024-12-01'
   * });
   * ```
   */
  public keyValueTable(data: Record<string, unknown>, options?: Partial<GOTableOptions>): void {
    const tableData = Object.entries(data).map(([key, value]) => ({
      key,
      value: valueToString(value),
    }));

    this.table({
      ...options,
      columns: [
        { header: 'Key', key: 'key', width: 25 },
        { header: 'Value', key: 'value', width: 50 },
      ],
      data: tableData,
    } as GOTableOptions);
  }

  /**
   * Capitalize first letter of a string
   */
  private capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
