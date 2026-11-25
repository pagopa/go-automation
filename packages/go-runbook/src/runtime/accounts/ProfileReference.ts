/** A profile reference inside a message, delimited by fixed strings (see `scrubAwsProfileNames`). */
export interface ProfileReference {
  /** Text that opens the reference, e.g. `(profile: `. */
  readonly opener: string;
  /** Text that closes the reference, e.g. `)`; the first one after the opener ends it. */
  readonly closer: string;
  /** Text written in place of the whole reference. */
  readonly replacement: string;
  /** Also removes the whitespace right before the opener. */
  readonly removeLeadingWhitespace: boolean;
}
