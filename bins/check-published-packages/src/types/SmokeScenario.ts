/** One installation of the published tarballs and what it must be able to import (EVO-PKGPUB-OPUS-01 §10.2). */
export interface SmokeScenario {
  /** Short id, e.g. `S4-sqs`. */
  readonly id: string;
  readonly description: string;
  /** Published packages installed from their tarballs (their internal dependencies are added automatically). */
  readonly packages: ReadonlyArray<string>;
  /** Peer packages installed from the catalog versions (AWS SDK clients). */
  readonly peers: ReadonlyArray<string>;
  /** Specifiers that must import at runtime and type-check with `skipLibCheck: false`. */
  readonly imports: ReadonlyArray<string>;
  /** Also bundle the pilot handler with esbuild and check its modules and memory (S8). */
  readonly lambdaBundle?: boolean;
}
