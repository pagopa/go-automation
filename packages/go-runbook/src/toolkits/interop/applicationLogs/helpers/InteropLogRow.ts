/** An INTEROP application log row as the analyses read it: the emitting pod app, the message and its correlation. */
export interface InteropLogRow {
  readonly podApp: string;
  readonly message: string;
  readonly cid?: string;
  readonly timestamp?: string;
}
