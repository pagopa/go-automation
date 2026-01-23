/**
 * Console Logger Handler
 * Outputs log events to the console with colors and hierarchical indentation
 */

import { GOLogEvent } from '../GOLogEvent.js';
import { GOLogEventCategory } from '../GOLogEventCategory.js';
import type { GOLoggerHandler } from '../GOLoggerHandler.js';
import { GOConsoleLoggerStyle } from './GOConsoleLoggerStyle.js';

/**
 * Console logger handler with hierarchical indentation support
 */
export class GOConsoleLoggerHandler implements GOLoggerHandler {
  private style: GOConsoleLoggerStyle;
  private indentLevel: number = 0;
  private readonly indentSize: number = 2;

  constructor(style?: GOConsoleLoggerStyle) {
    this.style = style || new GOConsoleLoggerStyle();
  }

  /**
   * Handle a log event and output to console
   */
  public handle(event: GOLogEvent): void {
    if (event.category === GOLogEventCategory.FATAL) {
      return; // Ignore fatal events
    }

    if (event.category === GOLogEventCategory.ERROR) {
      console.error(this.style.format(event, ' '.repeat(this.indentLevel * this.indentSize)));
      return;
    }

    // Adjust indentation based on category
    this.updateIndentLevel(event.category);

    // Get indentation string
    const indent = ' '.repeat(this.indentLevel * this.indentSize);

    // Format and output
    const formatted = this.style.format(event, indent);
    console.log(formatted);

    // Increase indentation after header/section
    if (
      event.category === GOLogEventCategory.HEADER ||
      event.category === GOLogEventCategory.SECTION
    ) {
      this.indentLevel++;
    }
  }

  /**
   * Update indentation level based on category
   */
  private updateIndentLevel(category: GOLogEventCategory): void {
    // Reset indentation for headers
    if (category === GOLogEventCategory.HEADER) {
      this.indentLevel = 0;
    }
    // Sections are at level 1 (under header)
    else if (category === GOLogEventCategory.SECTION) {
      // If we were deeper than level 1, go back to 1
      if (this.indentLevel > 1) {
        this.indentLevel = 1;
      }
    }
    // Other categories don't change the level before printing
    // (but header/section will increase it after)
  }

  /**
   * Reset indentation to zero
   */
  public async reset(): Promise<void> {
    this.indentLevel = 0;
  }

  /**
   * Get current style configuration
   */
  public getStyle(): GOConsoleLoggerStyle {
    return this.style;
  }

  /**
   * Set custom style configuration
   */
  public setStyle(style: GOConsoleLoggerStyle): void {
    this.style = style;
  }
}
