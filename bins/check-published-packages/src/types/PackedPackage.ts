/** A published workspace package packed with `pnpm pack`. */
export interface PackedPackage {
  readonly name: string;
  readonly version: string;
  /** Absolute path of the tarball. */
  readonly tarball: string;
  /** Declared `engines.node` range. */
  readonly enginesNode: string;
  /** Export subpaths, `package.json` excluded (e.g. `.`, `./s3`). */
  readonly subpaths: ReadonlyArray<string>;
  /** Internal `@pagopa/*` dependencies. */
  readonly internalDependencies: ReadonlyArray<string>;
}
