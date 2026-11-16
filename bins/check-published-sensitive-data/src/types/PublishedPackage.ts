/** A workspace package published to the registry (`@pagopa/*`, not private). */
export interface PublishedPackage {
  readonly name: string;
  /** Absolute directory of the package. */
  readonly directory: string;
}
