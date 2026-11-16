/** A value accepted in one file of one published package only, with a written reason (EVO-AWSACCT-OPUS-01 §9). */
export interface SensitiveDataException {
  /** Name of the published package (e.g. `@pagopa/go-aws`): an exception never crosses packages. */
  readonly package: string;
  /** Path relative to the package root, as published (e.g. `dist/index.js`). */
  readonly file: string;
  readonly value: string;
  readonly reason: string;
}
