/**
 * Notification Import Worker
 *
 * Processes imported rows and handles the complete workflow:
 * 1. Import rows from CSV (using NotificationImporter)
 * 2. Upload documents (if documentFilePath is present)
 * 3. Build NotificationRequest objects
 * 4. Send notifications (optional)
 */

import * as fs from 'fs';

import { GOEventEmitterBase } from '../../../core/events/GOEventEmitterBase.js';
import type { GOListImporter } from '../../../core/importers/GOListImporter.js';
import type {
  GOListImportErrorEvent,
  GOListImportProgressEvent,
} from '../../../core/importers/GOListImporterEvents.js';
import { SENDNotifications } from '../../SENDNotifications.js';

import { SENDNotificationImportBatchProcessor } from './SENDNotificationImportBatchProcessor.js';
import {
  SENDNotificationImportRowProcessor,
  toExportRow,
  type ToExportRowOptions,
} from './SENDNotificationImportRowProcessor.js';
import type { SENDNotificationImportWorkerError } from './SENDNotificationImportWorkerError.js';
import type { SENDNotificationImportWorkerEventMap } from './SENDNotificationImportWorkerEvents.js';
import type { SENDNotificationImportWorkerOptions } from './SENDNotificationImportWorkerOptions.js';
import type { SENDNotificationImportWorkerResult } from './SENDNotificationImportWorkerResult.js';
import type { SENDNotificationRow } from './SENDNotificationRow.js';
import { getErrorMessage } from '../../../core/index.js';

type ImportSource = string | Buffer;

export class SENDNotificationImportWorker extends GOEventEmitterBase<SENDNotificationImportWorkerEventMap> {
  private readonly rowProcessor: SENDNotificationImportRowProcessor;
  private readonly batchProcessor: SENDNotificationImportBatchProcessor;

  constructor(
    private readonly importer: GOListImporter<SENDNotificationRow>,
    sdk: SENDNotifications,
  ) {
    super();
    this.rowProcessor = new SENDNotificationImportRowProcessor(sdk);
    this.batchProcessor = new SENDNotificationImportBatchProcessor(this.rowProcessor);

    // Register to rowProcessor events and propagate them
    this.rowProcessor.on('worker:document:uploaded', (event) => this.emit('worker:document:uploaded', event));
    this.rowProcessor.on('worker:notification:sent', (event) => this.emit('worker:notification:sent', event));
    this.rowProcessor.on('worker:iun:obtained', (event) => this.emit('worker:iun:obtained', event));
    this.rowProcessor.on('worker:iun:polling:attempt', (event) => this.emit('worker:iun:polling:attempt', event));
    this.rowProcessor.on('worker:iun:polling:failed', (event) => this.emit('worker:iun:polling:failed', event));

    // Register to batchProcessor events and propagate them
    this.batchProcessor.on('worker:progress', (event) => this.emit('worker:progress', event));
    this.batchProcessor.on('worker:error', (event) => this.emit('worker:error', event));
  }

  async process(
    source: ImportSource,
    options: SENDNotificationImportWorkerOptions,
  ): Promise<SENDNotificationImportWorkerResult> {
    const startTime = Date.now();
    // Choose streaming mode for large files (>10MB by default) or if explicitly requested
    // Streaming mode processes rows incrementally to reduce memory usage
    const shouldUseStreaming = this.shouldUseStreaming(source, options) && typeof source === 'string';

    if (shouldUseStreaming) {
      return this.processWithStreaming(source, options, startTime);
    } else {
      return this.processWithImport(source, options, startTime);
    }
  }

  private async processWithImport(
    source: ImportSource,
    options: SENDNotificationImportWorkerOptions,
    startTime: number,
  ): Promise<SENDNotificationImportWorkerResult> {
    this.emit('worker:progress', {
      progress: {
        phase: 'importing',
        totalRows: 0,
        processedRows: 0,
        documentsUploaded: 0,
        notificationsSent: 0,
        iunsObtained: 0,
        failedRows: 0,
        currentBatch: 0,
        percentage: 0,
      },
    });

    // Register event listeners for import progress and errors
    const progressHandler = (importProgress: GOListImportProgressEvent): void => {
      this.emit('worker:progress', {
        progress: {
          phase: 'importing',
          totalRows: importProgress.totalItems ?? importProgress.processedItems,
          processedRows: importProgress.processedItems,
          documentsUploaded: 0,
          notificationsSent: 0,
          iunsObtained: 0,
          failedRows: importProgress.invalidItems,
          currentBatch: 0,
          percentage: importProgress.percentage ?? 0,
        },
      });
    };

    const errorHandler = (importError: GOListImportErrorEvent): void => {
      this.emit('worker:error', {
        error: {
          rowIndex: importError.itemIndex,
          rowData: importError.itemData,
          message: importError.message,
          type: 'import',
        },
      });
    };

    this.importer.on('import:progress', progressHandler);
    this.importer.on('import:error', errorHandler);

    try {
      const importResult = await this.importer.import(source);

      const errors: SENDNotificationImportWorkerError[] = [
        ...(importResult.errors ?? []).map((e) => ({
          rowIndex: e.itemIndex,
          rowData: e.itemData,
          message: e.message,
          type: 'import' as const,
        })),
      ];

      const result = await this.batchProcessor.processBatch(
        importResult.items,
        options,
        0, // baseProcessedRows = 0 (no rows processed yet)
        importResult.stats.invalidItems,
        errors,
        importResult.items.length, // totalRows = all imported items
      );

      if (options.exporter) {
        await this.exportBatch(result, options);
      }

      return {
        ...result,
        stats: {
          ...result.stats,
          processingTime: Date.now() - startTime,
        },
      };
    } finally {
      // Clean up event listeners
      this.importer.off('import:progress', progressHandler);
      this.importer.off('import:error', errorHandler);
    }
  }

  private async processWithStreaming(
    source: string,
    options: SENDNotificationImportWorkerOptions,
    startTime: number,
  ): Promise<SENDNotificationImportWorkerResult> {
    const sentNotifications: {
      row: SENDNotificationRow;
      notificationRequestId: string;
      iun?: string | undefined;
    }[] = [];
    const errors: SENDNotificationImportWorkerError[] = [];
    const stats = {
      processedRows: 0,
      documentsUploaded: 0,
      notificationsSent: 0,
      iunsObtained: 0,
      failedRows: 0,
    };
    let totalRowsFromImport = 0; // Track total rows from import phase

    // Register event listeners for import progress and errors
    const progressHandler = (importProgress: GOListImportProgressEvent): void => {
      // Update totalRows from import progress
      totalRowsFromImport = importProgress.totalItems ?? importProgress.processedItems;

      this.emit('worker:progress', {
        progress: {
          phase: 'importing',
          totalRows: totalRowsFromImport,
          processedRows: importProgress.processedItems,
          documentsUploaded: stats.documentsUploaded,
          notificationsSent: stats.notificationsSent,
          iunsObtained: stats.iunsObtained,
          failedRows: importProgress.invalidItems + stats.failedRows,
          currentBatch: 0,
          percentage: importProgress.percentage ?? 0,
        },
      });
    };

    const errorHandler = (importError: GOListImportErrorEvent): void => {
      this.emit('worker:error', {
        error: {
          rowIndex: importError.itemIndex,
          rowData: importError.itemData,
          message: importError.message,
          type: 'import',
        },
      });
    };

    this.importer.on('import:progress', progressHandler);
    this.importer.on('import:error', errorHandler);

    try {
      // Initialize streaming exporter if provided
      // This allows incremental export as notifications are processed
      let exportWriter: Awaited<ReturnType<NonNullable<typeof options.exporter>['exportStream']>> | undefined;
      if (options.exporter) {
        exportWriter = await options.exporter.exportStream();
      }

      try {
        // GOListImporter yields single items, so we batch them for processing
        const batchSize = options.concurrency ?? 10;
        let rowBatch: SENDNotificationRow[] = [];

        for await (const row of this.importer.importStream(source)) {
          rowBatch.push(row);

          // Process when batch is full
          if (rowBatch.length >= batchSize) {
            const result = await this.batchProcessor.processBatch(
              rowBatch,
              options,
              stats.processedRows,
              stats.failedRows,
              errors,
              totalRowsFromImport,
            );
            sentNotifications.push(...result.sentNotifications);
            stats.processedRows += result.stats.processedRows;
            stats.documentsUploaded += result.stats.documentsUploaded;
            stats.notificationsSent += result.stats.notificationsSent;
            stats.iunsObtained += result.stats.iunsObtained;
            stats.failedRows += result.stats.failedRows;

            // Export each notification in streaming mode if exporter is available
            // Each notification with IUN is appended to the export file immediately
            if (exportWriter) {
              await this.exportStreaming(result, exportWriter, options);
            }

            // Reset batch
            rowBatch = [];
          }
        }

        // Process remaining items in the last batch
        if (rowBatch.length > 0) {
          const result = await this.batchProcessor.processBatch(
            rowBatch,
            options,
            stats.processedRows,
            stats.failedRows,
            errors,
            totalRowsFromImport,
          );
          sentNotifications.push(...result.sentNotifications);
          stats.processedRows += result.stats.processedRows;
          stats.documentsUploaded += result.stats.documentsUploaded;
          stats.notificationsSent += result.stats.notificationsSent;
          stats.iunsObtained += result.stats.iunsObtained;
          stats.failedRows += result.stats.failedRows;

          if (exportWriter) {
            await this.exportStreaming(result, exportWriter, options);
          }
        }

        // Close the export stream
        if (exportWriter) {
          await exportWriter.close();
        }

        return {
          sentNotifications,
          stats: {
            totalRows: stats.processedRows,
            ...stats,
            processingTime: Date.now() - startTime,
          },
          errors: errors.length > 0 ? errors : undefined,
        };
      } catch (error) {
        // Ensure export stream is closed on error
        if (exportWriter) {
          try {
            await exportWriter.close();
          } catch (closeError) {
            this.emit('worker:error', {
              error: {
                rowIndex: 0,
                rowData: {},
                message: `Failed to close export stream: ${getErrorMessage(closeError)}`,
                type: 'export',
              },
            });
          }
        }
        throw error;
      }
    } finally {
      // Clean up event listeners
      this.importer.off('import:progress', progressHandler);
      this.importer.off('import:error', errorHandler);
    }
  }

  private shouldUseStreaming(source: string | Buffer, options: SENDNotificationImportWorkerOptions): boolean {
    if (options.useStreaming === true) return true;
    if (options.useStreaming === false) return false;

    if (typeof source === 'string') {
      try {
        const stats = fs.statSync(source);
        const sizeMB = stats.size / (1024 * 1024);
        const threshold = options.streamingThresholdMB ?? 10;
        return sizeMB > threshold;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Build export options based on worker options
   */
  private buildExportRowOptions(options: SENDNotificationImportWorkerOptions): ToExportRowOptions {
    return {
      requireIun: !(options.exportAllRows ?? false),
      includeStatus: options.includeStatusColumns ?? false,
    };
  }

  /**
   * Export batch results to file
   * Collects all notifications with IUN and exports them at once
   */
  private async exportBatch(
    result: SENDNotificationImportWorkerResult,
    options: SENDNotificationImportWorkerOptions,
  ): Promise<void> {
    if (!options.exporter) return;

    const exportRowOptions = this.buildExportRowOptions(options);

    const exportRows = result.sentNotifications
      .map((sent) =>
        toExportRow(
          {
            row: sent.row,
            docUploaded: false,
            notificationResult: {
              notificationRequestId: sent.notificationRequestId,
              iun: sent.iun,
            },
          },
          exportRowOptions,
        ),
      )
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (exportRows.length > 0) {
      await options.exporter.export(exportRows);
    }
  }

  /**
   * Export notifications in streaming mode
   * Each notification with IUN is appended to the export file immediately
   */
  private async exportStreaming(
    result: SENDNotificationImportWorkerResult,
    exportWriter: Awaited<ReturnType<NonNullable<SENDNotificationImportWorkerOptions['exporter']>['exportStream']>>,
    options: SENDNotificationImportWorkerOptions,
  ): Promise<void> {
    const exportRowOptions = this.buildExportRowOptions(options);

    for (const sent of result.sentNotifications) {
      const exportRow = toExportRow(
        {
          row: sent.row,
          docUploaded: false,
          notificationResult: { notificationRequestId: sent.notificationRequestId, iun: sent.iun },
        },
        exportRowOptions,
      );
      if (exportRow) {
        await exportWriter.append(exportRow);
      }
    }
  }
}
