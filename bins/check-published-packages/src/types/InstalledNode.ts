/** A package installed in a consumer project, read from its `package.json`. */
export interface InstalledNode {
  /** Real directory (symlinks resolved). */
  readonly directory: string;
  readonly name: string;
  /** `name@version`. */
  readonly id: string;
  /** Declared `engines.node`, when there is one. */
  readonly range?: string;
  /** Names of its dependencies, optional dependencies and peer dependencies. */
  readonly dependencies: ReadonlyArray<string>;
}
