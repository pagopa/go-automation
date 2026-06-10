/**
 * Attachment Upload Worker
 *
 * Uploads a batch of local files to SafeStorage, driven by an input file:
 * 1. Streams rows from the injected importer (CSV/JSON/JSONL)
 * 2. Uploads each file with bounded concurrency (preload + presigned PUT)
 * 3. Writes one export record per row, incrementally and in input order,
 *    including failed rows with their error message
 */

import {
  GOConcurrencyPool,
  GOEventEmitterBase,
  GOOrderedListExporterStreamWriter,
  getErrorMessage,
} from '@go-automation/go-common/core';
import type { GOListImporter, GOListImportErrorEvent } from '@go-automation/go-common/core';

import { SENDNotifications } from '../../SENDNotifications.js';
import { inferAttachmentContentType } from './SENDAttachmentContentTypes.js';
import { buildUploadExportRecord } from './SENDAttachmentUploadExportRecord.js';
import type { SENDAttachmentUploadedFile } from './SENDAttachmentUploadedFile.js';
import type { SENDAttachmentUploadRow } from './SENDAttachmentUploadRow.js';
import type {
  SENDAttachmentUploadWorkerError,
  SENDAttachmentUploadWorkerErrorPhase,
} from './SENDAttachmentUploadWorkerError.js';
import type { SENDAttachmentUploadWorkerEventMap } from './SENDAttachmentUploadWorkerEvents.js';
import type { SENDAttachmentUploadWorkerOptions } from './SENDAttachmentUploadWorkerOptions.js';
import type { SENDAttachmentUploadWorkerResult } from './SENDAttachmentUploadWorkerResult.js';

/** Default number of parallel uploads */
const DEFAULT_CONCURRENCY = 3;

/** Row paired with its position in the input file */
interface IndexedUploadRow {
  readonly row: SENDAttachmentUploadRow;
  readonly index: number;
}

export class SENDAttachmentUploadWorker extends GOEventEmitterBase<SENDAttachmentUploadWorkerEventMap> {
  constructor(
    private readonly importer: GOListImporter<SENDAttachmentUploadRow>,
    private readonly sdk: SENDNotifications,
  ) {
    super();
  }

  /**
   * Uploads every file described by the input file to SafeStorage
   *
   * Rows are consumed in streaming mode with bounded concurrency; export
   * records are appended to the exporter incrementally, preserving the
   * input order. Failed rows are always exported with their error message.
   *
   * With `skipOnError=false` (default) the worker stops consuming rows at
   * the first failure, lets in-flight uploads settle (their records are
   * still exported) and returns a result with `stoppedOnError=true`. The
   * promise rejects only for non-row errors: an unreadable input source or
   * an export write failure.
   *
   * @param source - Path of the input file
   * @param options - Processing options
   * @returns Upload results, statistics and per-row errors
   */
  async process(
    source: string,
    options: SENDAttachmentUploadWorkerOptions = {},
  ): Promise<SENDAttachmentUploadWorkerResult> {
    const startTime = Date.now();
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const skipOnError = options.skipOnError ?? false;

    // Per-run state (no instance state survives across process() calls)
    const uploads: SENDAttachmentUploadedFile[] = [];
    const errors: SENDAttachmentUploadWorkerError[] = [];
    const counters = { processedRows: 0, uploadedFiles: 0, failedRows: 0 };
    const pendingAppends: Promise<void>[] = [];
    let rowCounter = 0;
    let stoppedOnError = false;
    let importErrorNotified = false;
    let sourceError: unknown;
    let exportError: unknown;

    const streamWriter = options.exporter ? await options.exporter.exportStream() : undefined;
    const orderedWriter = streamWriter
      ? new GOOrderedListExporterStreamWriter<Record<string, unknown>>(streamWriter)
      : undefined;

    const emitProgress = (): void => {
      this.emit('worker:progress', { progress: { ...counters } });
    };

    const recordRowFailure = (
      index: number,
      rowData: unknown,
      message: string,
      phase: SENDAttachmentUploadWorkerErrorPhase,
    ): void => {
      const failure: SENDAttachmentUploadWorkerError = { rowIndex: index, rowData, message, phase };
      errors.push(failure);
      counters.failedRows += 1;
      counters.processedRows += 1;
      this.emit('worker:error', { error: failure });
    };

    /**
     * Appends a record via the ordered writer; the first failure is recorded
     * as an 'export' error and always aborts processing (output integrity)
     */
    const appendRecord = async (index: number, record: Record<string, unknown>): Promise<void> => {
      if (!orderedWriter) return;
      try {
        await orderedWriter.append(index, record);
      } catch (error) {
        if (exportError === undefined) {
          exportError = error;
          const failure: SENDAttachmentUploadWorkerError = {
            rowIndex: index,
            rowData: record,
            message: getErrorMessage(error),
            phase: 'export',
          };
          errors.push(failure);
          this.emit('worker:error', { error: failure });
        }
        throw error;
      }
    };

    // Rows rejected by the importer (validation/parse) still produce an
    // export record at their input position, built from the raw record
    const importErrorHandler = (event: GOListImportErrorEvent): void => {
      // JSON importers re-emit fatal errors as a catch-all event with
      // itemIndex 0 and null itemData (row events are 1-based): skip it,
      // the failure surfaces through the stream and rejects process()
      if (event.itemIndex === 0 && event.itemData === null) return;

      importErrorNotified = true;
      const index = rowCounter;
      rowCounter += 1;
      recordRowFailure(index, event.itemData, event.message, 'import');
      const record = buildUploadExportRecord(event.itemData, { status: 'failed', errorMessage: event.message });
      // Handler is synchronous: track the append, swallow its rejection
      // (already captured as exportError) and surface it in the epilogue
      pendingAppends.push(appendRecord(index, record).catch(() => undefined));
      emitProgress();
    };

    /**
     * Wraps importStream pairing each row with its input position and
     * converting iteration errors into a graceful end of stream: if the
     * error escaped the generator, GOConcurrencyPool.runEach would rethrow
     * immediately without awaiting the in-flight uploads
     */
    const importer = this.importer;
    async function* indexedRows(): AsyncGenerator<IndexedUploadRow, void, unknown> {
      try {
        for await (const row of importer.importStream(source)) {
          importErrorNotified = false;
          const index = rowCounter;
          rowCounter += 1;
          yield { row, index };
        }
      } catch (error) {
        if (!skipOnError && importErrorNotified) {
          // Invalid row already recorded by the import:error handler;
          // with skipOnError=false the importer rethrows it to stop the run
          stoppedOnError = true;
        } else {
          // Source-level failure (missing file, malformed content, IO error)
          sourceError = error;
        }
      }
    }

    const uploadRow = async (indexed: IndexedUploadRow): Promise<void> => {
      const { row, index } = indexed;
      let phase: SENDAttachmentUploadWorkerErrorPhase = 'read';

      try {
        const contentType = row.contentType ?? inferAttachmentContentType(row.filePath) ?? options.defaultContentType;
        if (contentType === undefined) {
          throw new Error(
            `Cannot determine content type for '${row.filePath}': add a contentType field or set a default content type`,
          );
        }

        const buffer = await this.sdk.attachment.readFileFromDisk(row.filePath);

        phase = 'upload';
        const result = await this.sdk.attachment.upload(buffer, contentType);

        // Keep scalars only: result.buffer must not be retained
        const uploaded: SENDAttachmentUploadedFile = {
          rowIndex: index,
          filePath: row.filePath,
          fileKey: result.ref.key,
          versionToken: result.ref.versionToken,
          sha256: result.digests.sha256,
          fileSizeBytes: buffer.length,
          contentType,
          uploadedAt: new Date().toISOString(),
        };
        uploads.push(uploaded);
        counters.uploadedFiles += 1;
        counters.processedRows += 1;
        this.emit('worker:file:uploaded', { row, upload: uploaded });

        await appendRecord(index, buildUploadExportRecord(row, { status: 'uploaded', upload: uploaded }));
        emitProgress();
      } catch (error) {
        // Export failures are fatal regardless of skipOnError
        if (exportError !== undefined) throw error;

        const message = getErrorMessage(error);
        recordRowFailure(index, row, message, phase);
        await appendRecord(index, buildUploadExportRecord(row, { status: 'failed', errorMessage: message }));
        emitProgress();

        if (!skipOnError) throw error;
      }
    };

    this.importer.on('import:error', importErrorHandler);
    try {
      try {
        await new GOConcurrencyPool(concurrency).runEach(indexedRows(), uploadRow);
      } catch {
        // A task rejected: a row failure with skipOnError=false, or an
        // export failure (kept in exportError and rethrown below)
        if (exportError === undefined) {
          stoppedOnError = true;
        }
      }

      await Promise.all(pendingAppends);

      if (orderedWriter) {
        try {
          await orderedWriter.close();
        } catch (error) {
          if (exportError === undefined) {
            exportError = error;
          }
        }
      }
    } finally {
      this.importer.off('import:error', importErrorHandler);
    }

    if (sourceError !== undefined) {
      throw sourceError instanceof Error ? sourceError : new Error(getErrorMessage(sourceError));
    }
    if (exportError !== undefined) {
      throw exportError instanceof Error ? exportError : new Error(getErrorMessage(exportError));
    }

    return {
      uploads,
      stats: {
        totalRows: rowCounter,
        uploadedFiles: counters.uploadedFiles,
        failedRows: counters.failedRows,
        processingTime: Date.now() - startTime,
      },
      stoppedOnError,
      ...(errors.length > 0 && { errors }),
    };
  }
}
