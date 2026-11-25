/**
 * A local document that cannot be sent; the row becomes `INVALID`.
 */
export interface DocumentInspectionFailure {
  readonly path: string;
  /** `FILE_NOT_FOUND`, `FILE_UNREADABLE`, `UNSUPPORTED_EXTENSION`, `NOT_A_PDF`, `FILE_TOO_BIG`, `FILE_EMPTY`. */
  readonly failure: string;
  readonly message: string;
}
