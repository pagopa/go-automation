/**
 * HTML List Exporter - Generic HTML exporter for any list of objects
 */

import * as fs from 'fs';

import { GOEventEmitterBase } from '../../events/GOEventEmitterBase.js';
import { toError } from '../../errors/GOErrorUtils.js';
import { valueToString } from '../../utils/GOValueToString.js';
import type { GOListExporter } from '../GOListExporter.js';
import type { GOListExporterEventMap } from '../GOListExporterEvents.js';
import type { GOListExporterStreamWriter } from '../GOListExporterStreamWriter.js';
import type { GOHTMLListExporterOptions } from './GOHTMLListExporterOptions.js';

/**
 * Default HTML template for the document
 */
const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Export Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
    .footer { margin-top: 20px; color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Export Report</h1>
  <p>Total items: {{count}}</p>
  <table>
    {{items}}
  </table>
  <div class="footer">Generated on {{date}}</div>
</body>
</html>`;

/**
 * Default row template for table rows
 */
const DEFAULT_ROW_TEMPLATE = `<tr>{{cells}}</tr>`;

/**
 * Generic HTML list exporter
 * Exports any array of objects to HTML format with customizable templates
 *
 * @template TItem - The type of items to export
 */
export class GOHTMLListExporter<TItem extends Record<string, unknown>>
  extends GOEventEmitterBase<GOListExporterEventMap>
  implements GOListExporter<TItem>
{
  private exportedCount: number = 0;
  private failedCount: number = 0;
  private startTime: number = 0;
  private totalItems?: number | undefined;
  private htmlBuffer: string[] = [];
  private isHeaderWritten: boolean = false;
  private columns?: string[] | undefined;

  constructor(private readonly options: GOHTMLListExporterOptions<TItem>) {
    super();
  }

  /**
   * Export items in batch mode
   */
  async export(items: TItem[]): Promise<void> {
    this.startTime = Date.now();
    this.exportedCount = 0;
    this.failedCount = 0;
    this.totalItems = items.length;
    this.htmlBuffer = [];
    this.isHeaderWritten = false;
    this.columns = undefined;

    const destination = this.options.outputPath;
    this.emit('export:started', {
      itemCount: items.length,
      destination: destination,
      mode: 'batch',
    });

    // Build HTML content
    const rowsHtml: string[] = [];

    for (const item of items) {
      const transformedItem = this.transformItem(item);
      if (transformedItem) {
        const currentIndex = this.exportedCount + this.failedCount;

        try {
          const rowHtml = this.buildRow(transformedItem);
          rowsHtml.push(rowHtml);
          this.exportedCount++;
          this.emit('export:item', { item: transformedItem, index: currentIndex });

          const percentage = this.totalItems
            ? Math.round((this.exportedCount / this.totalItems) * 100)
            : undefined;
          this.emit('export:progress', {
            exportedItems: this.exportedCount,
            totalItems: this.totalItems,
            percentage,
          });
        } catch (error) {
          this.failedCount++;
          const finalError = toError(error);
          this.emit('export:error', {
            error: finalError,
            item: transformedItem,
            index: currentIndex,
          });

          if (!this.options.skipInvalidItems) {
            throw error;
          }
        }
      }
    }

    // Generate final HTML
    const template = this.options.template ?? DEFAULT_TEMPLATE;
    const headerRow = this.buildHeaderRow();
    const allRows = headerRow + rowsHtml.join('\n');
    const date = new Date().toLocaleString();

    const html = template
      .replace('{{items}}', allRows)
      .replace('{{count}}', String(this.exportedCount))
      .replace('{{date}}', date);

    // Write to file
    await fs.promises.writeFile(this.options.outputPath, html, {
      encoding: this.options.encoding ?? 'utf8',
    });

    this.emit('export:completed', {
      totalItems: this.exportedCount,
      failedItems: this.failedCount,
      destination: this.options.outputPath,
      duration: Date.now() - this.startTime,
    });
  }

  /**
   * Initialize streaming export mode
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async exportStream(): Promise<GOListExporterStreamWriter<TItem>> {
    this.startTime = Date.now();
    this.exportedCount = 0;
    this.failedCount = 0;
    this.totalItems = undefined;
    this.htmlBuffer = [];
    this.isHeaderWritten = false;
    this.columns = undefined;

    const destination = this.options.outputPath;
    this.emit('export:started', { itemCount: 0, destination: destination, mode: 'stream' });

    return {
      append: async (item: TItem) => {
        await this.appendItem(item);
      },
      close: async () => {
        await this.closeStream();
      },
    };
  }

  /**
   * Append a single item to the stream
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  private async appendItem(item: TItem): Promise<void> {
    const transformedItem = this.transformItem(item);
    if (!transformedItem) return;

    const currentIndex = this.exportedCount + this.failedCount;

    try {
      const rowHtml = this.buildRow(transformedItem);
      this.htmlBuffer.push(rowHtml);

      this.exportedCount++;
      this.emit('export:item', { item: transformedItem, index: currentIndex });

      const percentage = this.totalItems
        ? Math.round((this.exportedCount / this.totalItems) * 100)
        : undefined;
      this.emit('export:progress', {
        exportedItems: this.exportedCount,
        totalItems: this.totalItems,
        percentage,
      });
    } catch (error) {
      this.failedCount++;
      const finalError = toError(error);
      this.emit('export:error', { error: finalError, item: transformedItem, index: currentIndex });

      if (!this.options.skipInvalidItems) {
        throw error;
      }
    }
  }

  /**
   * Close the stream and write final HTML
   */
  private async closeStream(): Promise<void> {
    const template = this.options.template ?? DEFAULT_TEMPLATE;
    const headerRow = this.buildHeaderRow();
    const allRows = headerRow + this.htmlBuffer.join('\n');
    const date = new Date().toLocaleString();

    const html = template
      .replace('{{items}}', allRows)
      .replace('{{count}}', String(this.exportedCount))
      .replace('{{date}}', date);

    await fs.promises.writeFile(this.options.outputPath, html, {
      encoding: this.options.encoding ?? 'utf8',
    });

    this.emit('export:completed', {
      totalItems: this.exportedCount,
      failedItems: this.failedCount,
      destination: this.options.outputPath,
      duration: Date.now() - this.startTime,
    });
  }

  /**
   * Transform item using custom transformer if provided
   */
  private transformItem(item: TItem): TItem | null {
    try {
      if (this.options.rowTransformer) {
        return this.options.rowTransformer(item);
      }
      return item;
    } catch (error) {
      this.emit('export:error', { error: toError(error) });
      return null;
    }
  }

  /**
   * Build HTML table header row
   */
  private buildHeaderRow(): string {
    if (this.isHeaderWritten) return '';

    this.isHeaderWritten = true;

    if (!this.columns) {
      return '';
    }

    const headers = this.columns.map((col) => `<th>${this.escapeHtml(col)}</th>`).join('');
    return `<tr>${headers}</tr>\n`;
  }

  /**
   * Build HTML table row from item
   */
  private buildRow(item: TItem): string {
    // Extract columns from first item
    this.columns ??= Object.keys(item);
    const rowTemplate = this.options.rowTemplate ?? DEFAULT_ROW_TEMPLATE;

    // Build cells
    const cells = this.columns
      .map((col) => {
        const value = item[col];
        const displayValue = valueToString(value);
        const shouldAllowRawHtml = this.shouldAllowRawHtml(col);
        return `<td>${shouldAllowRawHtml ? displayValue : this.escapeHtml(displayValue)}</td>`;
      })
      .join('');

    return rowTemplate.replace('{{cells}}', cells);
  }

  /**
   * Check if raw HTML should be allowed for a specific column
   */
  private shouldAllowRawHtml(columnName: string): boolean {
    if (!this.options.allowRawHtml) return false;
    if (this.options.allowRawHtml === true) return true;
    return this.options.allowRawHtml.includes(columnName);
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m] ?? m);
  }
}
