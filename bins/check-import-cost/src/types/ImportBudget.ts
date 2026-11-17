/** Import budget of one published entrypoint. */
export interface ImportBudget {
  /** Specifiers measured together, e.g. `['@pagopa/go-runbook/inventory', '@pagopa/go-runbook/runtime']`. */
  readonly specifiers: ReadonlyArray<string>;
  /** Maximum cold import time in milliseconds (median of the runs). */
  readonly maxMilliseconds: number;
  /** Third-party packages allowed in the module graph; absent means any is allowed. */
  readonly allowedThirdParty?: ReadonlyArray<string>;
  /** Third-party packages (or prefixes ending in `/`) that must not appear in the module graph. */
  readonly forbidden?: ReadonlyArray<string>;
  /** The only `@aws-sdk/client-*` packages allowed in the module graph; absent means no restriction. */
  readonly onlySdkClients?: ReadonlyArray<string>;
  /** Forbid native `.node` modules. */
  readonly noNativeModules?: boolean;
}
