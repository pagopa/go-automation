/**
 * A file read by `GOBinaryFileImporter` with `confineTo` resolves (symlinks
 * included) outside the allowed directory.
 */
export class GOPathOutsideRootError extends Error {
  /**
   * @param filePath - Path as requested
   * @param realPath - Path after resolving symlinks
   * @param root - Allowed directory, after resolving symlinks
   */
  constructor(
    public readonly filePath: string,
    public readonly realPath: string,
    public readonly root: string,
  ) {
    super(`File ${filePath} resolves to ${realPath}, outside ${root}`);
    this.name = 'GOPathOutsideRootError';
  }
}
