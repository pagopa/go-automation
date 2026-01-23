/**
 * Log Event
 * Represents a single log entry with all necessary information
 */

import { GOLogEventCategory } from './GOLogEventCategory.js';

export class GOLogEvent {
  /** Log message text */
  public readonly message: string;

  /** Timestamp when the log event was created */
  public readonly timestamp: Date;

  /** Category/severity of the log message */
  public readonly category: GOLogEventCategory;

  constructor(message: string, category: GOLogEventCategory = GOLogEventCategory.STEP) {
    this.message = message;
    this.timestamp = new Date();
    this.category = category;
  }

  /**
   * Create a newline log event
  */
  public static newline(): GOLogEvent {
    return new GOLogEvent('', GOLogEventCategory.TEXT);
  }

  /**
 * Create a newline log event
*/
  public static text(text: string): GOLogEvent {
    return new GOLogEvent(text, GOLogEventCategory.TEXT);
  }

  /**
   * Create a step log event
   */
  public static step(message: string): GOLogEvent {
    return new GOLogEvent(message, GOLogEventCategory.STEP);
  }

  /**
   * Create a success log event
   */
  public static success(message: string): GOLogEvent {
    return new GOLogEvent(message, GOLogEventCategory.SUCCESS);
  }

  /**
   * Create an error log event
   */
  public static error(message: string): GOLogEvent {
    return new GOLogEvent(message, GOLogEventCategory.ERROR);
  }

  /**
   * Create a fatal log event
   */
  public static fatal(message: string): GOLogEvent {
    return new GOLogEvent(message, GOLogEventCategory.FATAL);
  }

  /**
   * Create a warning log event
   */
  public static warning(message: string): GOLogEvent {
    return new GOLogEvent(message, GOLogEventCategory.WARNING);
  }

  /**
   * Create a header log event
   */
  public static header(message: string): GOLogEvent {
    return new GOLogEvent(message, GOLogEventCategory.HEADER);
  }

  /**
   * Create an info log event
   */
  public static info(message: string): GOLogEvent {
    return new GOLogEvent(message, GOLogEventCategory.INFO);
  }

  /**
   * Create a section log event
   */
  public static section(message: string): GOLogEvent {
    return new GOLogEvent(message, GOLogEventCategory.SECTION);
  }
}
