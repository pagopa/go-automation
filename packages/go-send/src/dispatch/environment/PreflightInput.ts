/**
 * What the environment preflight checks (§7.4.3).
 */
export interface PreflightInput {
  readonly basePath: string;
  readonly production: boolean;
  readonly groupId?: string;
  /** Hosts considered production (default: `api.notifichedigitali.it`). */
  readonly productionHosts?: ReadonlyArray<string>;
}
