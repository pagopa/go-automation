/**
 * SEND Import Notifications - Main Logic Module
 *
 * Contains the core business logic for CSV notification import workflow.
 * Receives typed dependencies (script) for clean separation of concerns.
 */

import { Core, SEND } from '@go-automation/go-common';

import { setupEventListeners } from './libs/setupEventListeners.js';
import { displayResults } from './libs/displayResults.js';
import { handleWorkflowError } from './libs/handleWorkflowError.js';
import type { ImportNotificationsConfig } from './types/ImportNotificationsConfig.js';

/** Base export columns for the CSV output */
const BASE_EXPORT_COLUMNS = [
  'ID_Scenario',
  'Scenario',
  'Prodotto',
  'Destinatario',
  'Denomination',
  'Indirizzo PEC',
  'physicalCommunicationType',
  'CAP',
  'Provincia',
  'Citta',
  'Stato',
  'Range',
  'Indirizzo',
  'Sender',
  'Tax ID',
  'RequestID',
  'Data invio Test',
  'Stato',
  'Esito',
  'Note',
  'iun',
];

/**
 * Main script execution function.
 *
 * Imports notifications from CSV, uploads documents, sends to PN API,
 * polls for IUN and exports results.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<ImportNotificationsConfig>();

  // Resolve export file path
  const exportPathInfo = script.paths.resolvePathWithInfo(config.exportFile, Core.GOPathType.OUTPUT);
  if (exportPathInfo) {
    if (exportPathInfo.isAbsolute) {
      script.logger.info(`Export path (absolute): ${exportPathInfo.path}`);
    } else {
      script.logger.info(`Output directory: ${exportPathInfo.resolvedDir}`);
      script.logger.info(`Export file will be saved to: ${exportPathInfo.path}`);
    }
  }

  // Initialize SDK
  script.logger.section('Initializing SEND SDK');
  const sdk = new SEND.SENDNotifications({
    basePath: config.basePath,
    apiKey: config.pnApiKey,
    timeout: 300000,
    debug: false,
    ...(config.proxyUrl !== undefined && { proxyUrl: config.proxyUrl }),
  });

  if (config.proxyUrl) {
    script.logger.info(`Using HTTP proxy: ${config.proxyUrl}`);
  }
  script.logger.success('SDK initialized');

  // Create importer
  script.logger.section('Setting up CSV Importer');
  const importerAdapter = new SEND.QATestFormatAdapter();
  const importer = new Core.GOCSVListImporter<SEND.SENDNotificationRow>({
    ...importerAdapter.getOptions(),
    preserveOriginalData: config.preserveAllColumns,
  });

  // Create exporter (if export file specified)
  let exporter: Core.GOCSVListExporter<Record<string, unknown>> | undefined;
  if (exportPathInfo) {
    script.logger.info(`Export file: ${exportPathInfo.path}`);
    exporter = new Core.GOCSVListExporter({
      outputPath: exportPathInfo.path,
      includeHeader: true,
      delimiter: ',',
      columns: BASE_EXPORT_COLUMNS,
      mergeOriginalColumns: config.preserveAllColumns,
      columnConflictStrategy: 'keep-generated',
      skipInvalidItems: true,
    });

    if (config.preserveAllColumns) {
      script.logger.info('CSV passthrough enabled: all original columns will be preserved');
    }
  }

  // Create worker and register events
  const worker = new SEND.SENDNotificationImportWorker(importer, sdk);
  setupEventListeners(worker, importer, exporter, script.prompt);
  script.logger.success('Components initialized');

  // Execute workflow
  script.logger.section('Starting Import Workflow');
  const csvInputPath = script.paths.resolvePath(config.csvFile, Core.GOPathType.INPUT);
  script.logger.info(`Input file: ${csvInputPath}`);
  script.logger.info(`Send mode: ${config.sendNotifications ? 'LIVE' : 'DRY-RUN'}`);
  script.logger.info(`Concurrency: ${config.concurrency}`);
  script.logger.info(`Poll for IUN: ${config.pollForIun}`);
  script.logger.newline();

  try {
    const result = await worker.process(csvInputPath, {
      concurrency: config.concurrency,
      skipFailedNotifications: false,
      sendNotifications: config.sendNotifications,
      pollForIun: config.pollForIun,
      pollMaxAttempts: config.pollMaxAttempts,
      pollDelayMs: config.pollDelayMs,
      useStreaming: 'auto',
      streamingThresholdMB: config.streamingThresholdMb,
      exporter: exporter,
      preserveAllColumns: config.preserveAllColumns,
      exportAllRows: config.exportAllRows,
      includeStatusColumns: config.includeStatusColumns,
    });

    displayResults(script, result, exportPathInfo?.path);
    script.logger.success('Workflow completed successfully');
  } catch (error) {
    handleWorkflowError(error, script.logger);
    throw error;
  } finally {
    script.prompt.stopSpinner();
    await script.cleanup();
  }
}
