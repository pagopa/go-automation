/**
 * Summary report of all file copy operations
 * Generated after finalizing registered files
 */

import type { GOFileCopyResult } from './GOFileCopyResult.js';

export interface GOFileCopyReport {
  /** All file copy results */
  readonly results: ReadonlyArray<GOFileCopyResult>;

  /** Summary statistics */
  readonly summary: GOFileCopyReportSummary;

  /** Path to the manifest file (if generated) */
  readonly manifestPath?: string | undefined;

  /** Timestamp when the report was generated */
  readonly timestamp: Date;
}

/**
 * Summary statistics for the copy report
 */
export interface GOFileCopyReportSummary {
  /** Total number of files registered */
  readonly totalFiles: number;

  /** Number of files successfully copied */
  readonly copiedFiles: number;

  /** Number of files skipped */
  readonly skippedFiles: number;

  /** Number of files that failed to copy */
  readonly failedFiles: number;

  /** Total bytes copied */
  readonly totalBytesCopied: number;

  /** Human-readable total size copied */
  readonly totalSizeCopiedHuman: string;
}
