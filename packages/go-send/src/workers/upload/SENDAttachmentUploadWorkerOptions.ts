/**
 * Worker options
 */

import type { GOListExporter } from '@go-automation/go-common/core';

export interface SENDAttachmentUploadWorkerOptions {
  /** Number of files to upload in parallel (default: 3) */
  concurrency?: number | undefined;

  /**
   * Continue with the next rows when a row fails (default: false).
   *
   * When false the worker stops consuming new rows at the first failure;
   * in-flight uploads are allowed to settle and the failed row is still
   * written to the export file with its error message.
   *
   * IMPORTANT: the injected importer must be configured with
   * `skipInvalidItems` equal to this flag, so that invalid input rows
   * follow the same skip/stop semantics as upload failures.
   */
  skipOnError?: boolean | undefined;

  /**
   * Optional exporter used to write one output record per processed row,
   * incrementally and in input order. Each record contains all the input
   * fields plus the generated upload fields (see buildUploadExportRecord).
   */
  exporter?: GOListExporter<Record<string, unknown>> | undefined;

  /**
   * Content type used when a row does not specify one and it cannot be
   * inferred from the file extension. When also absent, the row fails
   * with a 'read' phase error.
   */
  defaultContentType?: string | undefined;
}
