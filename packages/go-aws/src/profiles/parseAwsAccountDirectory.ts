import type { AWSAccountDirectoryEntry } from './AWSAccountDirectoryEntry.js';

/** `<product>/<account>/<environment>=<accountId>`, lower-case slugs and a 12-digit id. */
const ENTRY_PATTERN = /^(?<logical>[a-z0-9-]+\/[a-z0-9-]+)\/(?<environment>[a-z0-9-]+)=(?<accountId>[0-9]{12})$/u;

/**
 * Parses the account directory configuration (`aws.account.directory`) into
 * validated entries (EVO-AWSACCT-OPUS-01 §5.3, §8.1).
 *
 * Each entry has the form `<product>/<account>/<environment>=<accountId>`.
 * Blank entries are ignored and spaces around `=` are allowed. The parse rejects:
 * - malformed entries;
 * - a logical account declared twice in the same environment;
 * - an account id used in more than one environment, because the execution
 *   environment is derived from the occurrence account and would become ambiguous.
 *
 * One account id may serve several logical accounts of the same environment
 * (aliases); whether a runbook may read both is decided at execution time.
 *
 * Pure configuration parsing, with no AWS SDK. Complexity: O(N) in the number of entries.
 *
 * @param entries - Raw configuration values
 * @returns The entries, in declaration order
 * @throws Error when an entry is malformed or the directory violates an invariant
 *
 * @example
 * ```typescript
 * parseAwsAccountDirectory(['send/core/uat=000000000000', 'send/confinfo/uat=123456789012']);
 * // [{ logicalAccount: 'send/core', environment: 'uat', accountId: '000000000000' }, …]
 * ```
 */
export function parseAwsAccountDirectory(entries: ReadonlyArray<string>): ReadonlyArray<AWSAccountDirectoryEntry> {
  const parsed: AWSAccountDirectoryEntry[] = [];
  const declared = new Set<string>();
  const environmentByAccount = new Map<string, string>();

  for (const raw of entries) {
    const entry = raw.trim();
    if (entry === '') continue;

    const separator = entry.indexOf('=');
    const normalized =
      separator === -1 ? entry : `${entry.slice(0, separator).trim()}=${entry.slice(separator + 1).trim()}`;
    const groups = ENTRY_PATTERN.exec(normalized)?.groups;
    const logicalAccount = groups?.['logical'];
    const environment = groups?.['environment'];
    const accountId = groups?.['accountId'];
    if (logicalAccount === undefined || environment === undefined || accountId === undefined) {
      throw new Error(
        `Invalid AWS account directory entry "${entry}": expected <product>/<account>/<environment>=<12-digit account id>`,
      );
    }

    const key = `${logicalAccount}/${environment}`;
    if (declared.has(key)) {
      throw new Error(`AWS account directory declares ${key} more than once`);
    }
    declared.add(key);

    const knownEnvironment = environmentByAccount.get(accountId);
    if (knownEnvironment !== undefined && knownEnvironment !== environment) {
      throw new Error(
        `AWS account directory assigns account ${accountId} to environments ${knownEnvironment} and ${environment}: ` +
          'an account belongs to one environment only',
      );
    }
    environmentByAccount.set(accountId, environment);

    parsed.push({ logicalAccount, environment, accountId });
  }

  return parsed;
}
