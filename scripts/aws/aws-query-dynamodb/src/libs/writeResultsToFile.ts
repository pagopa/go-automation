/**
 * Writes query results to a file in the specified output format.
 */

import { Core } from '@go-automation/go-common';

import { formatForCsv, formatForText } from './OutputFormatter.js';
import type { ResultMap } from '../types/ResultMap.js';
import type { OutputFormat } from '../types/index.js';

/**
 * Writes results to file in the specified format.
 *
 * @param outputPath - Absolute path to the output file
 * @param resultMap - Mapping of PKs to result items
 * @param format - Output format (json, dynamo-json, ndjson, csv, text)
 * @param pkKey - Partition key attribute name (used for CSV output)
 */
export async function writeResultsToFile(
  outputPath: string,
  resultMap: ResultMap,
  format: OutputFormat,
  pkKey: string,
): Promise<void> {
  const items = Object.values(resultMap).flat();

  switch (format) {
    case 'json':
    case 'dynamo-json':
    case 'ndjson': {
      const isNdjson = format === 'ndjson';
      const exporter = new Core.GOJSONListExporter<unknown>({
        outputPath,
        pretty: !isNdjson,
        indent: 4,
        jsonl: isNdjson,
      });
      await exporter.export(items);
      break;
    }
    case 'csv': {
      const csvData = formatForCsv(resultMap, pkKey);
      const exporter = new Core.GOCSVListExporter<Record<string, unknown>>({
        outputPath,
        includeHeader: true,
      });
      await exporter.export(csvData);
      break;
    }
    case 'text': {
      const text = formatForText(resultMap);
      const textLines = text.split('\n').filter((line) => line.length > 0);
      const textExporter = new Core.GOFileListExporter({ outputPath });
      await textExporter.export(textLines);
      break;
    }
    default:
      throw new Error(`Unsupported output format: ${format as string}`);
  }
}
