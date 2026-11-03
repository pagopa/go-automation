/**
 * Run-level facts needed to build and validate a record.
 */
export interface RecordBuildContext {
  /** Base directory of relative document paths (`--documents-dir`). */
  readonly documentsDir: string;
  /** Whether the run has a shared document (source 4 of §8.1.1). */
  readonly sharedDocumentAvailable: boolean;
  /** Pratica keys of `--attachments-file`; `undefined` when not provided. */
  readonly knownPratiche?: ReadonlySet<string>;
  /** `sender.taxId` of the environment: rows with a different one are invalid (§7.4.2). */
  readonly environmentSenderTaxId?: string;
}
