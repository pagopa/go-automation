/**
 * A file exceeds the `maxBytes` of `GOBinaryFileImporter`.
 */
export class GOFileTooLargeError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly size: number,
    public readonly maxBytes: number,
  ) {
    super(`File ${filePath} is ${size} bytes, more than the ${maxBytes} allowed`);
    this.name = 'GOFileTooLargeError';
  }
}
