/**
 * A temporary directory created for a test, removed by `cleanup()`.
 */
export interface TempDir {
  /** Absolute path of the directory. */
  readonly path: string;

  /**
   * Resolves a path inside the directory (the file is not created).
   *
   * @param segments - Path segments relative to the directory
   * @returns The absolute path
   */
  file(...segments: ReadonlyArray<string>): string;

  /**
   * Writes a file inside the directory, creating missing parent directories.
   *
   * @param relativePath - Path relative to the directory
   * @param content - File content (strings are written as UTF-8)
   * @returns The absolute path of the written file
   */
  write(relativePath: string, content: string | Uint8Array): Promise<string>;

  /** Removes the directory and everything in it. */
  cleanup(): Promise<void>;
}
