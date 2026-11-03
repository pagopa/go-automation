import * as path from 'node:path';

import { GOCSVListImporter, GOJSONListImporter } from '@go-automation/go-common/core';

import type { InputFormat } from './InputFormat.js';
import type { InputReaderOptions } from './InputReaderOptions.js';
import type { InputRow } from './InputRow.js';

/**
 * Streams the input file (CSV, JSON array or JSONL) with the go-common
 * importers. The file is read once per pass (validation, send,
 * materialization), so memory never holds the whole input as rows.
 */
export class InputReader {
  constructor(private readonly options: InputReaderOptions) {}

  /**
   * Infers the format from the file extension.
   *
   * @param filePath - Input path
   * @returns The format, or `undefined` for unknown extensions
   */
  public static formatFromPath(filePath: string): InputFormat | undefined {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.csv') return 'csv';
    if (extension === '.json') return 'json';
    if (extension === '.jsonl' || extension === '.ndjson') return 'jsonl';
    return undefined;
  }

  /**
   * Reads the rows in input order.
   *
   * @returns Async iterator of rows
   */
  public async *rows(): AsyncGenerator<InputRow, void, unknown> {
    let rowIndex = 0;
    if (this.options.format === 'csv') {
      const importer = new GOCSVListImporter<Record<string, string>>({
        delimiter: this.options.delimiter ?? ',',
        hasHeaders: true,
        skipHeaderRows: this.options.skipRows ?? 0,
        encoding: this.options.encoding ?? 'utf8',
        skipInvalidItems: false,
      });
      for await (const item of importer.importStream(this.options.filePath)) {
        yield { rowIndex: rowIndex++, values: item, original: item };
      }
      return;
    }

    const importer = new GOJSONListImporter<unknown>({
      jsonl: this.options.format === 'jsonl',
      skipInvalidItems: false,
    });
    for await (const item of importer.importStream(this.options.filePath)) {
      const original = isRecord(item) ? item : { value: item };
      yield { rowIndex: rowIndex++, values: flatten(original), original };
    }
  }
}

/**
 * Flattens nested objects with dot notation (`recipient.taxId`); arrays are
 * joined with `|`, scalars stringified.
 */
function flatten(
  item: Readonly<Record<string, unknown>>,
  prefix = '',
  into: Record<string, string> = {},
): Record<string, string> {
  for (const [key, value] of Object.entries(item)) {
    const name = prefix === '' ? key : `${prefix}.${key}`;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      into[name] = value.map((element: unknown) => scalarToString(element)).join('|');
    } else if (isRecord(value)) {
      flatten(value, name, into);
    } else {
      into[name] = scalarToString(value);
    }
  }
  return into;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalarToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value) ?? '';
}
