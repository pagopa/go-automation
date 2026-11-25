/**
 * A local file to upload to SafeStorage before sending.
 */
export interface LocalDocument {
  /** Absolute path. */
  readonly path: string;
  readonly title: string;
}
