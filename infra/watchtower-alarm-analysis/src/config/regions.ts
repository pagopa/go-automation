/** Initial deployment allowlist. Adding a region still requires stack/OAM deploy, registry publish and canaries. */
export const DEFAULT_EXECUTE_RUNBOOK_REGIONS: ReadonlySet<string> = new Set(['eu-south-1']);

export function parseExecuteRunbookRegion(
  value: string,
  supported: ReadonlySet<string> = DEFAULT_EXECUTE_RUNBOOK_REGIONS,
): string {
  if (!supported.has(value)) throw new Error(`Unsupported execute-runbook region: ${value}`);
  return value;
}
