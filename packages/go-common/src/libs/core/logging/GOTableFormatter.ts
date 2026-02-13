/**
 * GOTableFormatter - Table formatting utilities for GOLogger
 * Uses cli-table3 for professional table rendering
 */

import Table from 'cli-table3';

import { valueToString } from '../utils/GOValueToString.js';

/**
 * Table column configuration
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
  formatter?: (value: unknown) => string;
}

/**
 * Table configuration options
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
    /** Enable colors in headers (default: false) */
    colors?: boolean;
    /** Header color (default: 'cyan') */
    headerColor?: 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray';
  };
}

/**
 * Table formatter utility using cli-table3
 */
export class GOTableFormatter {
  private readonly options: Required<GOTableOptions>;
  private readonly columns: GOTableColumn[];

  constructor(options: GOTableOptions) {
    // Set defaults
    this.options = {
      ...options,
      border: options.border !== false,
      headerSeparator: options.headerSeparator !== false,
      compact: options.compact ?? false,
      maxColumnWidth: options.maxColumnWidth ?? 50,
      style: {
        colors: options.style?.colors ?? true,
        headerColor: options.style?.headerColor ?? 'cyan',
      },
    };

    this.columns = options.columns;
  }

  /**
   * Format the complete table as string using cli-table3
   */
  format(): string {
    // Calculate column widths
    const colWidths = this.calculateColumnWidths();

    // Create table with cli-table3
    const table = new Table({
      head: this.columns.map((col) => col.header),
      colWidths: colWidths,
      colAligns: this.columns.map((col) => col.align ?? 'left'),
      style: {
        head: this.options.style.colors ? [this.options.style.headerColor ?? 'cyan'] : [],
        border: [],
      },
      chars: this.getTableChars(),
    });

    // Add data rows
    for (const row of this.options.data) {
      const rowData = this.columns.map((col) => {
        const value = row[col.key];
        return this.formatValue(value, col);
      });
      table.push(rowData);
    }

    return table.toString();
  }

  /**
   * Calculate optimal column widths
   */
  private calculateColumnWidths(): number[] {
    return this.columns.map((col) => {
      // Use explicit width if provided
      if (col.width) {
        return col.width;
      }

      // Calculate based on header and data
      const headerLen = col.header.length;
      const maxDataLen = Math.max(
        0,
        ...this.options.data.map((row) => {
          const value = this.formatValue(row[col.key], col);
          return value.length;
        }),
      );

      // Use max of header and data, but cap at maxColumnWidth
      // Add padding of 2 for better readability
      const width = Math.min(Math.max(headerLen, maxDataLen) + 2, this.options.maxColumnWidth);

      return width;
    });
  }

  /**
   * Format a value using column formatter or default
   */
  private formatValue(value: unknown, col: GOTableColumn): string {
    // Use custom formatter if provided
    if (col.formatter) {
      return col.formatter(value);
    }

    return valueToString(value);
  }

  /**
   * Get table characters based on options
   */
  private getTableChars(): Record<string, string> {
    if (this.options.compact) {
      // Compact mode: minimal borders
      return {
        top: '',
        'top-mid': '',
        'top-left': '',
        'top-right': '',
        bottom: '',
        'bottom-mid': '',
        'bottom-left': '',
        'bottom-right': '',
        left: '',
        'left-mid': '',
        mid: '',
        'mid-mid': '',
        right: '',
        'right-mid': '',
        middle: ' ',
      };
    }

    if (!this.options.border) {
      // No border mode: only show content and separators
      return {
        top: '',
        'top-mid': '',
        'top-left': '',
        'top-right': '',
        bottom: '',
        'bottom-mid': '',
        'bottom-left': '',
        'bottom-right': '',
        left: '',
        'left-mid': '',
        mid: '─',
        'mid-mid': '┼',
        right: '',
        'right-mid': '',
        middle: '│',
      };
    }

    // Default: full borders
    return {
      top: '─',
      'top-mid': '┬',
      'top-left': '┌',
      'top-right': '┐',
      bottom: '─',
      'bottom-mid': '┴',
      'bottom-left': '└',
      'bottom-right': '┘',
      left: '│',
      'left-mid': '├',
      mid: '─',
      'mid-mid': '┼',
      right: '│',
      'right-mid': '┤',
      middle: '│',
    };
  }
}
