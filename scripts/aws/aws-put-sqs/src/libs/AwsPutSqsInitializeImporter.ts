/**
 * AWS Put SQS - Initialize Importer
 */

import { Core } from '@go-automation/go-common';
import type { AwsPutSqsConfig } from '../types/AwsPutSqsConfig.js';

/**
 * Factory function to create the correct importer based on configuration or file extension
 * @param config - Configuration for the script
 * @param script - Script instance
 * @returns Promise<boolean> - True if action is confirmed, false otherwise
 */

export function initializeImporter(_script: Core.GOScript, config: AwsPutSqsConfig): Core.GOListImporter<unknown> {
  const extension = config.inputFile.split('.').pop()?.toLowerCase();
  const format = config.fileFormat === 'auto' ? extension : config.fileFormat;

  switch (format) {
    case 'json':
      return new Core.GOJSONListImporter({
        jsonl: 'auto',
        wrapSingleObject: true,
      });
    case 'csv':
      return new Core.GOCSVListImporter({
        hasHeaders: true,
        rowTransformer: (row: Record<string, string | undefined>) => row[config.csvColumn],
      });
    case 'text':
    case 'txt':
    default:
      return new Core.GOFileListImporter();
  }
}
