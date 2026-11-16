/** The `package.json` of a published package at one commit. */
export interface PublishedManifest {
  readonly name: string;
  readonly version: string;
  /** Folder name under `packages/`, e.g. `go-common`. */
  readonly directory: string;
  /** The whole manifest, parsed. */
  readonly manifest: Readonly<Record<string, unknown>>;
}
