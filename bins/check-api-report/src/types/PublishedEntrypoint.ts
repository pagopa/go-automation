/** One export subpath of a published package and its compiled type declarations. */
export interface PublishedEntrypoint {
  /** Package name, e.g. `@pagopa/go-runbook`. */
  readonly packageName: string;
  /** Absolute directory of the package. */
  readonly packageDirectory: string;
  /** Export subpath, e.g. `.` or `./toolkits/common`. */
  readonly subpath: string;
  /** Absolute path of the `types` file of the subpath. */
  readonly typesFile: string;
}
