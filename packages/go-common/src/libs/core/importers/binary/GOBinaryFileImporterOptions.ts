/**
 * Options of {@link ./GOBinaryFileImporter.GOBinaryFileImporter}.
 */
export interface GOBinaryFileImporterOptions {
  /** Absolute path of the file to read. */
  readonly inputPath: string;
  /** When `true`, a missing file yields `undefined` instead of throwing. */
  readonly optional?: boolean;
  /**
   * Maximum size in bytes. A larger file is not read: `import()` rejects
   * with `GOFileTooLargeError`, so a huge file never lands in memory.
   */
  readonly maxBytes?: number;
}
