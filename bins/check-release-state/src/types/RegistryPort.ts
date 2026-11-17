/** The npm registry operations of the release checks (GitHub Packages), synchronous like the npm CLI. Tests use a fake. */
export interface RegistryPort {
  /** Every published version of a package; empty when the package was never published. */
  versions(name: string): ReadonlyArray<string>;
  /** Current dist-tags of a package (`latest`, `next`, …); empty when never published. */
  distTags(name: string): Readonly<Record<string, string>>;
}
