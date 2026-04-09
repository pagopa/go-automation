/**
 * Send Download Safestorage Attachments - Main Logic Module
 *
 * Supports two input modes:
 *  - "uri-list"  : plain text file, one safestorage:// URI per line
 *  - "jsonl"     : JSONL file where each row contains a record with nested attachments;
 *                  the `keyValue` field is used as a sub-folder name for the downloaded files
 *
 * Files are downloaded directly from the Safe Storage S3 bucket via AWS SDK,
 * using the AWS profile configured with access to the confinfo account.
 */

import { Core } from '@go-automation/go-common';

import { SafeStorageS3Client } from './libs/SafeStorageS3Client.js';
import { loadTasks } from './libs/loadTasks.js';
import { parseExtensions, filterTasksByExtension } from './libs/extensionFilter.js';
import { runDownloads } from './libs/runDownloads.js';
import { displayResults } from './libs/displayResults.js';
import type { DownloadSafestorageAttachmentsConfig } from './types/DownloadSafestorageAttachmentsConfig.js';
import type { DownloadResult } from './types/DownloadResult.js';

/**
 * Main script execution function.
 *
 * Loads attachments from the configured input file, downloads each one directly
 * from the Safe Storage S3 bucket using AWS credentials, saves them to the
 * execution output directory, and exports a JSONL report with the results.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  script.logger.section('Starting Send Download Safestorage Attachments');

  const config = await script.getConfiguration<DownloadSafestorageAttachmentsConfig>();

  const inputFilePath = script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);
  script.logger.info(`Input file  : ${inputFilePath}`);
  script.logger.info(`Input mode  : ${config.inputMode}`);
  script.logger.info(`AWS profile : ${config.awsProfile}`);

  const allowedExtensions =
    config.fileExtensions !== undefined ? parseExtensions(config.fileExtensions) : new Set<string>();
  if (allowedExtensions.size > 0) {
    script.logger.info(`Filter ext  : ${[...allowedExtensions].join(', ')}`);
  }

  const outputDir = script.paths.createExecutionOutputDir();
  script.logger.info(`Output dir  : ${outputDir}`);

  const reportFilePath = script.paths.getExecutionOutputFilePath('download-report.jsonl');
  const s3Client = new SafeStorageS3Client(script.aws.s3);
  const exporter = new Core.GOJSONListExporter<DownloadResult>({ outputPath: reportFilePath, jsonl: true });
  script.prompt.startSpinner('Loading input file...');

  try {
    // Discover the Safe Storage bucket once upfront so any auth error is caught early
    script.prompt.spinLog('Resolving Safe Storage bucket...');
    const bucketName = await s3Client.findSafeStorageBucket();
    script.prompt.spinLog(`Safe Storage bucket: ${bucketName}`);

    // Load tasks from input file
    const allTasks = await loadTasks(config, inputFilePath, outputDir, script.prompt);
    const tasks = filterTasksByExtension(allTasks, allowedExtensions);

    if (allTasks.length === 0) {
      script.prompt.stopSpinner();
      script.logger.warning('No Safe Storage attachments found in input file. Nothing to download.');
      return;
    }

    if (tasks.length === 0) {
      script.prompt.stopSpinner();
      script.logger.warning(
        `No attachments match the extension filter [${[...allowedExtensions].join(', ')}]. ` +
          `Found ${allTasks.length} attachment(s) with other extensions.`,
      );
      return;
    }

    if (allowedExtensions.size > 0 && tasks.length < allTasks.length) {
      script.logger.info(`Extension filter: ${tasks.length} of ${allTasks.length} attachment(s) selected`);
    } else {
      script.logger.info(`Found ${tasks.length} attachment(s) to download`);
    }
    script.logger.newline();

    // Download all attachments
    const results = await runDownloads(tasks, s3Client, script.prompt);

    script.prompt.spinSucceed('downloading', `Downloads completed: ${results.length} processed`);

    // Export results report
    await exporter.export(results);
    script.logger.info(`Report saved to: ${reportFilePath}`);

    displayResults(script, results, reportFilePath);

    script.logger.success('Done');
  } finally {
    script.prompt.stopSpinner();
    s3Client.destroy();
  }
}
