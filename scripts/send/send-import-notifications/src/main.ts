/**
 * SEND Import Notifications - Main Logic Module
 *
 * Contains the core business logic for CSV notification import workflow.
 * Receives typed dependencies (script) for clean separation of concerns.
 */

import { Core, SEND } from '@go-automation/go-common';

import type { ImportNotificationsConfig } from './config.js';

// ============================================================================
// Event Listeners
// ============================================================================

/**
 * Setup event listeners for monitoring workflow progress
 *
 * @param worker - The notification import worker
 * @param importer - The CSV importer
 * @param exporter - The CSV exporter (optional)
 * @param prompt - The GOPrompt instance for spinner management
 */
function setupEventListeners(
  worker: SEND.SENDNotificationImportWorker,
  importer: Core.GOCSVListImporter,
  exporter: Core.GOCSVListExporter<Record<string, unknown>> | undefined,
  prompt: Core.GOPrompt
): void {
  // Worker events
  worker.on('worker:progress', (event) => {
    const progress = event.progress;
    let msg = '';
    if (progress.phase === 'importing') {
      msg = `[IMPORT] ${progress.percentage}% - Rows: ${progress.processedRows}, Valid: ${progress.processedRows - progress.failedRows}, Invalid: ${progress.failedRows}`;
      prompt.spin("importing", `\x1b[36m>\x1b[0m ${msg}`);
    } else {
      msg = `[PROCESS] ${progress.percentage}% - Processed: ${progress.processedRows}/${progress.totalRows}, Uploaded: ${progress.documentsUploaded}, Sent: ${progress.notificationsSent}, IUNs: ${progress.iunsObtained}, Failed: ${progress.failedRows}`;
      prompt.spinLog(`\x1b[36m>\x1b[0m ${msg}`);
    }
  });

  worker.on('worker:document:uploaded', (event) => {
    if ('subject' in event.row) {
      prompt.spin(event.row.subject, `Document uploaded: ${event.row.subject}`);
    }
  });

  worker.on('worker:notification:sent', (event) => {
    if ('subject' in event.row) {
      const spinnerId = event.response.notificationRequestId;
      prompt.spin(spinnerId, `Notification sent, waiting for IUN: ${event.row.subject}`);
    }
  });

  worker.on('worker:iun:obtained', (event) => {
    if ('subject' in event.row) {
      const spinnerId = event.notificationRequestId;
      prompt.spinSucceed(spinnerId, `IUN obtained: ${event.row.subject} - ${event.iun}`);
    }
  });

  worker.on('worker:iun:polling:attempt', (event) => {
    if ('subject' in event.row) {
      const spinnerId = event.notificationRequestId;
      const subject = event.row.subject;
      let message = `Polling IUN [${event.attempt}/${event.maxAttempts}]: ${subject} - Status: ${event.status}`;

      if (event.errors && event.errors.length > 0) {
        const errorDetails = event.errors
          .map((err: string | Record<string, unknown>) => typeof err === 'string' ? err : JSON.stringify(err))
          .join('\n    ');
        message += ` Errors: ${errorDetails}`;
        prompt.spinFail(spinnerId, message);
      } else {
        prompt.spin(spinnerId, message);
      }
    }
  });

  worker.on('worker:iun:polling:failed', (event) => {
    if ('subject' in event.row) {
      const spinnerId = event.notificationRequestId;
      prompt.spinFail(
        spinnerId,
        `IUN polling failed after ${event.attempts} attempts: ${event.row.subject}`
      );
    }
  });

  worker.on('worker:error', (event) => {
    let errorMsg = `\x1b[31mX\x1b[0m Error at row ${event.error.rowIndex} [${event.error.type}]: ${event.error.message}`;

    if (event.error.details) {
      const details = typeof event.error.details === 'object'
        ? JSON.stringify(event.error.details, null, 2)
        : String(event.error.details);
      errorMsg += `\n    Details: ${details}`;
    }

    prompt.spinLog(errorMsg);
  });

  // Importer events
  importer.on('import:started', (event) => {
    prompt.spinLog(`Import started: ${event.source}`);
  });

  importer.on('import:completed', (event) => {
    prompt.spinSucceed("importing",
      `\x1b[32mOK\x1b[0m Import completed: ${event.totalItems} items, ` +
      `${event.invalidItems} invalid (${event.duration}ms)`
    );
  });

  // Exporter events
  if (exporter) {
    exporter.on('export:started', (event) => {
      prompt.spinLog(`Export started: ${event.itemCount} items`);
    });

    exporter.on('export:completed', (event) => {
      prompt.spinLog(
        `\x1b[32mOK\x1b[0m Export completed: ${event.totalItems} items (${event.duration}ms)`
      );
    });
  }
}

// ============================================================================
// Results Display
// ============================================================================

/**
 * Display workflow results summary
 *
 * @param script - The GOScript instance for logging
 * @param result - The import worker result
 * @param exportFilePath - Path to the export file (optional)
 */
function displayResults(
  script: Core.GOScript,
  result: SEND.SENDNotificationImportWorkerResult,
  exportFilePath?: string
): void {
  script.logger.newline();
  script.logger.section('Workflow Results');

  const stats = [
    { label: 'Total rows', value: result.stats.totalRows },
    { label: 'Processed', value: result.stats.processedRows },
    { label: 'Documents uploaded', value: result.stats.documentsUploaded },
    { label: 'Notifications sent', value: result.stats.notificationsSent },
    { label: 'IUNs obtained', value: result.stats.iunsObtained },
    { label: 'Failed', value: result.stats.failedRows },
    { label: 'Processing time', value: `${(result.stats.processingTime / 1000).toFixed(2)}s` },
  ];

  script.logger.table({
    columns: [
      { header: 'Metric', key: 'label' },
      { header: 'Value', key: 'value' },
    ],
    data: stats,
    border: true,
  });

  if (result.stats.iunsObtained > 0 && exportFilePath) {
    script.logger.newline();
    script.logger.info(`Exported ${result.stats.iunsObtained} notifications to: ${exportFilePath}`);
  }

  if (result.errors && result.errors.length > 0) {
    script.logger.newline();
    script.logger.warning(`Errors encountered: ${result.errors.length}`);
    const errorsToShow: readonly SEND.SENDNotificationImportWorkerError[] = result.errors.slice(0, 5);
    let errorIndex = 0;
    for (const error of errorsToShow) {
      errorIndex += 1;
      script.logger.error(`  ${errorIndex}. Row ${error.rowIndex} [${error.type}]: ${error.message}`);
    }
    if (result.errors.length > 5) {
      script.logger.info(`  ... and ${result.errors.length - 5} more errors`);
    }
  }

  if (result.sentNotifications.length > 0) {
    script.logger.newline();
    script.logger.info(`Sent ${result.sentNotifications.length} notifications`);
  }
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Main script execution function
 *
 * Imports notifications from CSV, uploads documents, sends to PN API,
 * polls for IUN and exports results.
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<ImportNotificationsConfig>();

  // Resolve export file path using convenience method
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
  const importerBaseOptions = importerAdapter.getOptions();

  const importerOptions = {
    ...importerBaseOptions,
    preserveOriginalData: config.preserveAllColumns
  };

  const importer = new Core.GOCSVListImporter(importerOptions);

  // Create exporter (if export file specified)
  let exporter: Core.GOCSVListExporter<Record<string, unknown>> | undefined;
  if (exportPathInfo) {
    script.logger.info(`Export file: ${exportPathInfo.path}`);

    const baseExportColumns = [
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

    const exportColumns = baseExportColumns;

    const exporterBaseOptions: Core.GOCSVListExporterOptions = {
      outputPath: exportPathInfo.path,
      includeHeader: true,
      delimiter: ',',
      mergeOriginalColumns: config.preserveAllColumns,
      columnConflictStrategy: 'keep-generated',
      skipInvalidItems: true
    };

    exporterBaseOptions.columns = exportColumns;
    exporter = new Core.GOCSVListExporter(exporterBaseOptions);

    if (config.preserveAllColumns) {
      script.logger.info('CSV passthrough enabled: all original columns will be preserved');
    }
  }

  // Create worker
  const worker = new SEND.SENDNotificationImportWorker(importer, sdk);

  // Register event listeners
  setupEventListeners(worker, importer, exporter, script.prompt);

  script.logger.success('Components initialized');

  // Execute workflow
  script.logger.section('Starting Import Workflow');
  script.logger.info(`Input file: ${config.csvFile}`);
  script.logger.info(`Send mode: ${config.sendNotifications ? 'LIVE' : 'DRY-RUN'}`);
  script.logger.info(`Concurrency: ${config.concurrency}`);
  script.logger.info(`Poll for IUN: ${config.pollForIun}`);
  script.logger.newline();

  try {
    const result = await worker.process(config.csvFile, {
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
    if (error instanceof Core.GOHttpClientError) {
      script.logger.error(`Workflow failed: ${error.message} - response: ${JSON.stringify(error.response, null, 2)}`);
    } else if (error instanceof Error) {
      script.logger.error(`Workflow failed: ${error.message}`);
      script.logger.fatal(`Stack trace:\n${error.stack}`);
    } else {
      script.logger.error(`Workflow failed: ${String(error)}`);
    }
    throw error;
  } finally {
    script.prompt.stopSpinner();
    await script.cleanup();
  }
}
