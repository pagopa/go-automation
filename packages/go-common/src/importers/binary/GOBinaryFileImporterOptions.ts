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
   * with `GOFileTooLargeError`, so a huge file never lands in memory. The
   * size is checked on the open file and the bytes read are counted, so a
   * file growing after the check is cut off at the limit as well.
   */
  readonly maxBytes?: number;
  /**
   * Directory the file must live in. The real paths of both (symlinks
   * resolved) are compared, so neither `../` nor a symlink pointing outside
   * can escape it: such a file rejects with `GOPathOutsideRootError`. Use it
   * for paths that come from untrusted input (e.g. a column of a CSV).
   */
  readonly confineTo?: string;
}
