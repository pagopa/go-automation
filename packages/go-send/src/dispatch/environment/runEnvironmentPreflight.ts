import { GOHttpClientError } from '@go-automation/go-common/core';

import { DispatchError } from '../DispatchError.js';
import type { DispatchGroup } from '../model/DispatchGroup.js';
import type { GroupsFetchFn } from './GroupsFetchFn.js';
import type { PreflightInput } from './PreflightInput.js';
import type { PreflightReport } from './PreflightReport.js';

/** Default production hosts of the SEND B2B API. */
export const DEFAULT_PRODUCTION_HOSTS: ReadonlyArray<string> = ['api.notifichedigitali.it'];

/**
 * Checks API key, group and production coherence before any send (§7.4.3).
 *
 * - production host without `production: true` → stop;
 * - `401`/`403` on groups → stop (wrong or disabled API key);
 * - `groupId` not among the PA groups, or not `ACTIVE` → stop;
 * - no `groupId` while the PA has active groups → warning (SEND accepts it
 *   only if the API key has no groups, A15).
 *
 * `sender.taxId` cannot be checked here: a wrong one surfaces as `403` on
 * the first send, which is a global error.
 *
 * @param input - Environment facts to check
 * @param fetchGroups - Reads the PA groups (one B2B call, through the limiter)
 * @returns Report with the group shown in the send plan
 * @throws DispatchError with codes `INVALID_BASE_PATH`, `PRODUCTION_HOST`, `API_KEY_REJECTED`, `GROUP_NOT_FOUND`, `GROUP_NOT_ACTIVE`
 */
export async function runEnvironmentPreflight(
  input: PreflightInput,
  fetchGroups: GroupsFetchFn,
): Promise<PreflightReport> {
  const host = assertProductionCoherence(input);

  let groups: ReadonlyArray<DispatchGroup>;
  try {
    groups = await fetchGroups();
  } catch (error: unknown) {
    if (error instanceof GOHttpClientError && (error.statusCode === 401 || error.statusCode === 403)) {
      throw new DispatchError('API_KEY_REJECTED', `API key rejected by ${host} (HTTP ${error.statusCode})`, {
        cause: error,
      });
    }
    throw error;
  }

  const activeGroups = groups.filter((group) => group.status === 'ACTIVE');
  if (input.groupId === undefined) {
    const warnings =
      activeGroups.length === 0
        ? []
        : [
            `No groupId set while the PA has ${activeGroups.length} active groups: ` +
              'SEND accepts it only if the API key has no groups',
          ];
    return { activeGroups, warnings };
  }

  const group = groups.find((candidate) => candidate.id === input.groupId);
  if (group === undefined) {
    throw new DispatchError('GROUP_NOT_FOUND', `groupId ${input.groupId} is not a group of the PA owning the API key`);
  }
  if (group.status !== 'ACTIVE') {
    throw new DispatchError('GROUP_NOT_ACTIVE', `group ${group.name} (${group.id}) is ${group.status}`);
  }
  return { group, activeGroups, warnings: [] };
}

/**
 * Stops a run whose base path is a production host while the environment
 * does not declare `production: true` (§7.4.3). Makes no call.
 *
 * @param input - Base path and production flag
 * @returns The host of the base path
 * @throws DispatchError `INVALID_BASE_PATH` (malformed URL) or `PRODUCTION_HOST`
 */
export function assertProductionCoherence(input: PreflightInput): string {
  if (!URL.canParse(input.basePath)) {
    throw new DispatchError('INVALID_BASE_PATH', `basePath "${input.basePath}" is not a valid URL`);
  }
  const host = new URL(input.basePath).hostname.toLowerCase();
  const productionHosts = input.productionHosts ?? DEFAULT_PRODUCTION_HOSTS;
  if (!input.production && productionHosts.some((candidate) => candidate.toLowerCase() === host)) {
    throw new DispatchError(
      'PRODUCTION_HOST',
      `${host} is a production host but the environment does not declare production: true`,
    );
  }
  return host;
}
