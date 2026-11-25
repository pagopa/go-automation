/**
 * The write targets of a run, described for the production gate.
 *
 * A profile name is only half of what the gate checks: `~/.aws/config` lets
 * an operator name a production profile anything at all, so each profile is
 * also resolved to the account its credentials belong to.
 */

import type { GOProductionTarget } from '@go-automation/go-script';
import type { AWSProfileSet } from '@pagopa/go-aws';

/**
 * Describes each profile a write goes through by its name and its account.
 *
 * A profile whose identity cannot be resolved is treated as production, so the
 * operator types it back: the account is half of what the gate checks, and a
 * profile it cannot classify fails closed rather than slipping through on a
 * name that happens to carry no marker.
 *
 * Configured markers can only add to the built-in signals (name tokens and
 * account ids, applied by the gate itself): a marker list read from config
 * must not be able to switch the gate off.
 *
 * @param profileSet - The run's profiles
 * @param profiles - The profiles the write actually goes through
 * @param extraMarkers - Configured profile-name fragments, matched case-insensitively as substrings
 * @returns One target per profile, labelled with the profile name
 */
export async function resolveProductionTargets(
  profileSet: AWSProfileSet,
  profiles: ReadonlyArray<string>,
  extraMarkers: ReadonlyArray<string> = [],
): Promise<GOProductionTarget[]> {
  const markers = extraMarkers.map((marker) => marker.toLowerCase()).filter((marker) => marker !== '');

  return await Promise.all(
    profiles.map(async (profile): Promise<GOProductionTarget> => {
      const marked = markers.some((marker) => profile.toLowerCase().includes(marker));

      try {
        const accountId = await profileSet.getClientProvider(profile).resolveAccountId();
        return { label: profile, profile, accountId, ...(marked && { isProduction: true }) };
      } catch {
        return { label: profile, profile, isProduction: true, unresolved: true };
      }
    }),
  );
}
