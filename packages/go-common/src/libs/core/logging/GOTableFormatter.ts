/**
 * GOTableFormatter - Table formatting utilities for GOLogger.
 *
 * Internal deterministic table renderer. Composes the small helpers in
 * `tableRenderer/` to produce a Unicode-aware tabular output that supports
 * full / border-less / compact styles, multi-line cells (cells containing
 * `\n` expand the row's visual height), per-column alignment, truncation
 * with ellipsis, and ANSI-aware column width math.
 */

import { valueToString } from '../utils/GOValueToString.js';

import type { BorderStyle } from './tableRenderer/BorderStyle.js';
import type { ChalkLikeColor } from './tableRenderer/colorize.js';
import { colorize } from './tableRenderer/colorize.js';
import { displayWidth } from './tableRenderer/displayWidth.js';
import { renderRow } from './tableRenderer/renderRow.js';
import { renderSeparator } from './tableRenderer/renderSeparator.js';
import type { ResolvedColumn } from './tableRenderer/ResolvedColumn.js';
import type { TableChars } from './tableRenderer/TableChars.js';
import { TABLE_CHARS_BY_STYLE } from './tableRenderer/TableChars.js';

type GOTableValueFormatter = (value: unknown) => string;

/** Default cap on auto-computed column width */
const DEFAULT_MAX_COLUMN_WIDTH = 50;

/** Total inner padding added by `renderRow` (1 space left + 1 space right) */
const INNER_PADDING = 2;

/** Minimum total column width: " x " (3) — content of 1 cell + padding */
const MIN_COLUMN_WIDTH = INNER_PADDING + 1;

/**
 * Table column configuration.
 */
export interface GOTableColumn {
  /** Column header text */
  header: string;

  /** Key to extract from data object */
  key: string;

  /** Fixed column width (auto-calculated if not provided) */
  width?: number;

  /** Text alignment */
  align?: 'left' | 'right' | 'center';

  /** Custom formatter function */
  formatter?: GOTableValueFormatter;
}

/**
 * Table configuration options.
 */
export interface GOTableOptions {
  /** Column definitions */
  columns: GOTableColumn[];

  /** Data rows (array of objects) */
  data: Record<string, unknown>[];

  /** Show border lines (default: true) */
  border?: boolean;

  /** Show header separator line (default: true) */
  headerSeparator?: boolean;

  /** Compact mode (no borders, minimal spacing) */
  compact?: boolean;

  /** Maximum width before truncation (default: 50) */
  maxColumnWidth?: number;

  /** Style for the table */
  style?: {
    /** Enable colors in headers (default: true) */
    colors?: boolean;
    /** Header color (default: 'cyan') */
    headerColor?: ChalkLikeColor;
  };
}

/**
 * Table formatter utility.
 *
 * Public API is unchanged from the previous cli-table3-backed implementation.
 * Internally composes pure helpers so each concern (padding, truncation,
 * separators, multi-line splitting, ANSI colors) is testable in isolation.
 */
export class GOTableFormatter {
  private readonly resolvedColumns: ReadonlyArray<ResolvedColumn>;
  private readonly chars: TableChars;
  private readonly headerColor: ChalkLikeColor | undefined;
  private readonly headerSeparator: boolean;
  private readonly data: ReadonlyArray<Record<string, unknown>>;

  constructor(options: GOTableOptions) {
    const borderStyle: BorderStyle = this.resolveBorderStyle(options);

    this.chars = TABLE_CHARS_BY_STYLE[borderStyle];
    this.headerColor = (options.style?.colors ?? true) ? (options.style?.headerColor ?? 'cyan') : undefined;
    this.headerSeparator = options.headerSeparator !== false;
    this.data = options.data;
    this.resolvedColumns = this.resolveColumns(options);
  }

  /**
   * Renders the complete table as a single string.
   *
   * Layout:
   * 1. Top separator (if active for the border style)
   * 2. Header row (with optional ANSI color)
   * 3. Mid separator (if `headerSeparator` is true and chars are non-empty)
   * 4. One block per data row (each may span multiple visual lines)
   * 5. Bottom separator (if active for the border style)
   *
   * Returns an empty string when `columns` is empty.
   */
  format(): string {
    if (this.resolvedColumns.length === 0) return '';

    const lines: string[] = [];

    const top = renderSeparator(this.resolvedColumns, this.chars, 'top');
    if (top !== '') lines.push(top);

    const headerCells = this.resolvedColumns.map((c) => colorize(c.header, this.headerColor));
    lines.push(renderRow(headerCells, this.resolvedColumns, this.chars.vertical));

    const midSeparator = renderSeparator(this.resolvedColumns, this.chars, 'mid');

    if (this.headerSeparator && midSeparator !== '') {
      lines.push(midSeparator);
    }

    for (const [idx, row] of this.data.entries()) {
      // Insert a row separator between consecutive data rows (mirrors the legacy
      // cli-table3 default). Compact style produces an empty separator and is
      // therefore skipped; the bottom border closes the table after the last row.
      if (idx > 0 && midSeparator !== '') {
        lines.push(midSeparator);
      }
      const cells = this.resolvedColumns.map((c) => c.formatter(row[c.key]));
      lines.push(renderRow(cells, this.resolvedColumns, this.chars.vertical));
    }

    const bottom = renderSeparator(this.resolvedColumns, this.chars, 'bottom');
    if (bottom !== '') lines.push(bottom);

    return lines.join('\n');
  }

  /**
   * Maps the legacy `compact` / `border` boolean pair to the internal
   * `BorderStyle` discriminated union. `compact` wins over `border: false`.
   */
  private resolveBorderStyle(options: GOTableOptions): BorderStyle {
    if (options.compact === true) return 'compact';
    if (options.border === false) return 'border-less';
    return 'full';
  }

  /**
   * Resolves columns: applies defaults, computes width considering
   * multi-line cells (max line width across all data rows and the
   * header), clamps to `maxColumnWidth` from below by `MIN_COLUMN_WIDTH`.
   */
  private resolveColumns(options: GOTableOptions): ReadonlyArray<ResolvedColumn> {
    const maxWidth = options.maxColumnWidth ?? DEFAULT_MAX_COLUMN_WIDTH;

    return options.columns.map((col) => {
      const formatter: (value: unknown) => string = col.formatter ?? ((value) => valueToString(value));

      let maxCellW = displayWidth(col.header);
      for (const row of options.data) {
        const formatted = formatter(row[col.key]);
        for (const line of formatted.split('\n')) {
          const lineW = displayWidth(line);
          if (lineW > maxCellW) maxCellW = lineW;
        }
      }

      const targetW = col.width ?? Math.min(maxCellW + INNER_PADDING, maxWidth);

      return {
        header: col.header,
        key: col.key,
        width: Math.max(MIN_COLUMN_WIDTH, targetW),
        align: col.align ?? 'left',
        formatter,
      };
    });
  }
}
