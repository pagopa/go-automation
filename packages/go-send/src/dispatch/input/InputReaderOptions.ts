import type { InputFormat } from './InputFormat.js';

/**
 * Options of {@link ./InputReader.InputReader}.
 */
export interface InputReaderOptions {
  readonly filePath: string;
  readonly format: InputFormat;
  /** CSV delimiter (default `,`). */
  readonly delimiter?: string;
  /** CSV lines skipped before the header (default `0`). */
  readonly skipRows?: number;
  readonly encoding?: BufferEncoding;
}
