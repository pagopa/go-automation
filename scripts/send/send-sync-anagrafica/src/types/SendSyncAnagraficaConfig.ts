/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */

import type { GOExportFormat } from '@pagopa/go-common/exporters';
export interface SendSyncAnagraficaConfig {
  /** Local checkout of pn-configuration. */
  readonly configPath: string;

  /** Environment whose configuration is compared. Never prod, never dev. */
  readonly env: string;

  /** Profiles of both accounts; each table is routed to the one that owns it. */
  readonly awsProfiles: ReadonlyArray<string>;

  /** AWS region holding the tables. */
  readonly awsRegion: string;

  /** Restricts the run to these tables; empty means every configured table. */
  readonly tableNames: ReadonlyArray<string>;

  /** Whether the drift is written back; off unless asked for. */
  readonly sync: boolean;

  /** Whether --sync only previews the writes it would send. */
  readonly dryRun: boolean;

  /** Fail the run when a table has no file, or a file has no table map entry */
  readonly strictConfiguration: boolean;

  /** Whether the confirmation covering every write is skipped. */
  readonly yes: boolean;

  /** Report file name. */
  readonly outputFile: string | undefined;

  /** Report format. */
  readonly outputFormat: GOExportFormat;

  /** Profile-name fragment marking the core account. */
  readonly accountsCore: string;

  /** Profile-name fragment marking the confinfo account. */
  readonly accountsConfinfo: string;

  /** Directory holding the per-account configuration inside an environment. */
  readonly configurationConfDir: string;

  /** Directory holding the table files inside an account. */
  readonly configurationDynamodbDir: string;

  /** File naming the tables, their account and their key schema. */
  readonly configurationTablesFile: string;

  /** Environments this script accepts. */
  readonly environmentsAllowed: ReadonlyArray<string>;

  /** Profile-name fragments that mark an account as production. */
  readonly guardProdProfileMarkers: ReadonlyArray<string>;
}
