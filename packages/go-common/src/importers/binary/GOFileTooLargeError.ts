/**
 * A file exceeds the `maxBytes` of `GOBinaryFileImporter`.
 *
 * `size` is the size reported when the file was opened or, when the file grew
 * while it was being read, the number of bytes read when the limit was crossed
 * (a lower bound of the real size, always greater than `maxBytes`).
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
