/**
 * Send Upload Attachments - Main Logic Module
 *
 * Uploads files to SafeStorage driven by an input file (csv/json/jsonl):
 * imports the rows, uploads each file with bounded concurrency and writes
 * an output file (input data + upload results) incrementally, in input order.
 */

import { Core } from '@go-automation/go-common';
import { SENDNotifications, SENDAttachmentUploadWorker } from '@go-automation/go-send';

import { createExporter } from './libs/createExporter.js';
import { createImporter } from './libs/createImporter.js';
import { displayResults } from './libs/displayResults.js';
import { handleWorkflowError } from './libs/handleWorkflowError.js';
import { buildDefaultOutputFileName, parseUploadFileFormat, resolveFileFormat } from './libs/resolveFileFormat.js';
import { setupEventListeners } from './libs/setupEventListeners.js';
import type { SendUploadAttachmentsConfig } from './types/index.js';

/**
 * Main script execution function.
 *
 * Imports rows from the input file, uploads files to SafeStorage and
 * exports results (incrementally) to the output file.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<SendUploadAttachmentsConfig>();

  // Resolve input file and formats
  const inputPath = script.paths.resolvePath(config.inputFile, Core.GOPathType.INPUT);
  const inputFormat = resolveFileFormat(inputPath);

  const outputFormat =
    config.outputFormat !== undefined
      ? parseUploadFileFormat(config.outputFormat)
      : config.outputFile !== undefined
        ? resolveFileFormat(config.outputFile)
        : inputFormat;
  const outputFile = config.outputFile ?? buildDefaultOutputFileName(config.inputFile, outputFormat);
  const outputPathInfo = script.paths.resolvePathWithInfo(outputFile, Core.GOPathType.OUTPUT);

  script.logger.info(`Input file: ${inputPath} (${inputFormat})`);
  script.logger.info(`Output file: ${outputPathInfo.path} (${outputFormat})`);

  // Initialize SDK
  script.logger.section('Initializing SEND SDK');
  const sdk = new SENDNotifications({
    basePath: config.basePath,
    apiKey: config.pnApiKey,
    timeout: 300000,
    debug: config.debug,
    ...(config.proxyUrl !== undefined && { proxyUrl: config.proxyUrl }),
  });

  if (config.proxyUrl) {
    script.logger.info(`Using HTTP proxy: ${config.proxyUrl}`);
  }
  script.logger.success('SDK initialized');

  // Create importer, exporter and worker
  const importer = createImporter(inputFormat, config.skipOnError);
  const exporter = createExporter(outputFormat, outputPathInfo.path);
  const worker = new SENDAttachmentUploadWorker(importer, sdk);
  setupEventListeners(worker, importer, script.prompt);
  script.logger.success('Components initialized');

  // Execute workflow
  script.logger.section('Starting Upload Workflow');
  script.logger.info(`Concurrency: ${config.concurrency}`);
  script.logger.info(`Skip on error: ${config.skipOnError}`);
  if (config.defaultContentType !== undefined) {
    script.logger.info(`Default content type: ${config.defaultContentType}`);
  }
  script.logger.newline();

  try {
    const result = await worker.process(inputPath, {
      concurrency: config.concurrency,
      skipOnError: config.skipOnError,
      exporter,
      ...(config.defaultContentType !== undefined && { defaultContentType: config.defaultContentType }),
    });

    displayResults(script, result, outputPathInfo.path);

    if (result.stoppedOnError) {
      throw new Error('Upload stopped at the first error (skip.on.error=false); see the output file for details');
    }

    if (result.stats.failedRows > 0) {
      script.logger.warning(`Workflow completed with ${result.stats.failedRows} failed rows`);
    } else {
      script.logger.success('Workflow completed successfully');
    }
  } catch (error) {
    handleWorkflowError(error, script.logger);
    throw error;
  } finally {
    script.prompt.stopSpinner();
    await script.cleanup();
  }
}
