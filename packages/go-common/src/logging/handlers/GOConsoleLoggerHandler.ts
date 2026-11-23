/**
 * Console Logger Handler
 * Outputs log events to the console with colors, grouping each header and section in a block drawn with a gutter
 */

import { consoleColorsEnabled, stripAnsi } from '../../render/ansi.js';
import { GOLogEvent } from '../GOLogEvent.js';
import { GOLogEventCategory } from '../GOLogEventCategory.js';
import type { GOLoggerHandler } from '../GOLoggerHandler.js';
import { redactSensitiveLogText } from '../GOSensitiveLogRedactor.js';
import { ConsoleColors, GOConsoleLoggerStyle } from './GOConsoleLoggerStyle.js';

/** The block the next line belongs to: none, the card opened by a header, or a section. */
type ConsoleBlock = 'none' | 'card' | 'section';

const BAR = `${ConsoleColors.DIM}│${ConsoleColors.RESET}`;
const GUTTER = `${BAR}  `;
const CARD_END = `${ConsoleColors.DIM}╰─${ConsoleColors.RESET}`;

/**
 * Console logger handler: a header opens a card (`╭─ … ╰─`), a section opens a block (`◆ …`), and every line of a
 * card or a section is drawn behind the `│` gutter. Consecutive sections are joined by a `│` line.
 */
export class GOConsoleLoggerHandler implements GOLoggerHandler {
  private style: GOConsoleLoggerStyle;
  private block: ConsoleBlock = 'none';
  // Whether the last line written is empty or a bare gutter, so a block never gets two separators in a row.
  private lastLineBlank: boolean = true;
  // Whether to keep ANSI colors. Disabled in non-TTY contexts (Lambda/CloudWatch,
  // CI, pipes) so escape sequences do not leak into the logs.
  private readonly colorsEnabled: boolean;

  constructor(style?: GOConsoleLoggerStyle) {
    this.style = style ?? new GOConsoleLoggerStyle();
    this.colorsEnabled = consoleColorsEnabled();
  }

  /**
   * Apply the color policy: strip ANSI sequences when colors are disabled.
   */
  private render(formatted: string): string {
    return this.colorsEnabled ? formatted : stripAnsi(formatted);
  }

  private redactEvent(event: GOLogEvent): GOLogEvent {
    const redactedMessage = redactSensitiveLogText(event.message);
    const redactedEvent = new GOLogEvent(redactedMessage, event.category, event.data);
    Object.defineProperty(redactedEvent, 'timestamp', { value: event.timestamp });
    return redactedEvent;
  }

  /**
   * Handle a log event and output to console
   */
  public handle(event: GOLogEvent): void {
    if (event.category === GOLogEventCategory.FATAL) {
      return; // Ignore fatal events
    }

    const redactedEvent = this.redactEvent(event);

    if (event.category === GOLogEventCategory.HEADER || event.category === GOLogEventCategory.SECTION) {
      this.openBlock(redactedEvent);
      return;
    }

    const inBlock = this.block !== 'none';
    if (event.category === GOLogEventCategory.TEXT && redactedEvent.message.length === 0) {
      this.write(inBlock ? BAR : '', true);
      return;
    }

    const formatted = this.style.format(redactedEvent);
    const line = inBlock ? GUTTER + formatted.replaceAll('\n', `\n${GUTTER}`) : formatted;
    this.write(line, false, event.category === GOLogEventCategory.ERROR);
  }

  /**
   * Closes the current block and opens the one of a header or a section, separated from what came before.
   */
  private openBlock(event: GOLogEvent): void {
    const joinSections = this.block === 'section' && event.category === GOLogEventCategory.SECTION;
    if (this.block === 'card') {
      this.write(CARD_END, false);
    }
    if (!this.lastLineBlank) {
      this.write(joinSections ? BAR : '', true);
    }
    this.write(this.style.format(event), false);
    this.block = event.category === GOLogEventCategory.HEADER ? 'card' : 'section';
  }

  private write(line: string, blank: boolean, toStderr: boolean = false): void {
    const rendered = this.render(line);
    if (toStderr) {
      console.error(rendered);
    } else {
      process.stdout.write(`${rendered}\n`);
    }
    this.lastLineBlank = blank;
  }

  /**
   * Leave any open block: the next line starts at the margin
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  public async reset(): Promise<void> {
    this.block = 'none';
    this.lastLineBlank = true;
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
