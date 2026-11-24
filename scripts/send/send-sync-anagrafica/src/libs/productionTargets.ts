/**
 * The write targets of a run, described for the production gate.
 *
 * A profile name is only half of what the gate checks: `~/.aws/config` lets
 * an operator name a production profile anything at all, so each profile is
 * also resolved to the account its credentials belong to.
 */

import { isProductionTarget } from '@go-automation/go-script';
import type { GOProductionTarget } from '@go-automation/go-script';

import type { AWSProfileSet } from '@pagopa/go-aws';

/**
 * Describes each profile a write goes through by its name and its account.
 *
 * A profile whose identity cannot be resolved is treated as production: the
 * account is half of what the gate checks, so a profile it cannot classify fails
 * closed rather than slipping through on a name that happens to carry no marker.
 * Its write would fail on the same credentials anyway.
 *
 * @param profileSet - The run's profiles
 * @param profiles - The profiles the write actually goes through; all of them when omitted
 * @returns One target per profile, labelled with the profile name
 */
export async function resolveProductionTargets(
  profileSet: AWSProfileSet,
  profiles: ReadonlyArray<string> = profileSet.profileNames,
): Promise<GOProductionTarget[]> {
  return await Promise.all(
    profiles.map(async (profile): Promise<GOProductionTarget> => {
      try {
        const accountId = await profileSet.getClientProvider(profile).resolveAccountId();
        return { label: profile, profile, accountId };
      } catch {
        return { label: profile, profile, isProduction: true, unresolved: true };
      }
    }),
  );
}

/**
 * The profiles a production refusal must refuse.
 *
 * The baseline — go-script's production tokens and account ids — always
 * applies; the configured markers can only add to it. A marker list read from
 * config used to be the whole rule, so `--gpm none` switched the refusal off.
 *
 * @param profileSet - The run's profiles
 * @param extraMarkers - Configured profile-name fragments, matched case-insensitively as substrings
 * @param profiles - The profiles to check; all of them when omitted
 * @returns The profiles that are production on any signal, in the order given
 */
export async function findProductionProfiles(
  profileSet: AWSProfileSet,
  extraMarkers: ReadonlyArray<string>,
  profiles: ReadonlyArray<string> = profileSet.profileNames,
): Promise<string[]> {
  const markers = extraMarkers.map((marker) => marker.toLowerCase()).filter((marker) => marker !== '');
  const targets = await resolveProductionTargets(profileSet, profiles);

  return targets
    .filter(
      (target) => isProductionTarget(target) || markers.some((marker) => target.label.toLowerCase().includes(marker)),
    )
    .map((target) => target.label);
}

/** Why a profile is refused: it is production, or its account could not be resolved. */
export interface ProductionProfileVerdict {
  /** The profile name */
  readonly profile: string;
  /** True when the only reason is that the account could not be resolved (expired SSO, no access) */
  readonly unresolved: boolean;
}

/**
 * Like {@link findProductionProfiles}, but says why each profile is refused.
 *
 * A profile whose account cannot be resolved is refused (fail closed), but it is not
 * necessarily production: its SSO session may simply have expired. `unresolved` is true
 * only when no other signal (a production token in the name, a configured marker) says
 * production, so the refusal can name the real reason.
 *
 * @param profileSet - The run's profiles
 * @param extraMarkers - Configured profile-name fragments, matched case-insensitively as substrings
 * @param profiles - The profiles to check; all of them when omitted
 * @returns The refused profiles with their reason, in the order given
 */
export async function findProductionProfileVerdicts(
  profileSet: AWSProfileSet,
  extraMarkers: ReadonlyArray<string>,
  profiles: ReadonlyArray<string> = profileSet.profileNames,
): Promise<ProductionProfileVerdict[]> {
  const markers = extraMarkers.map((marker) => marker.toLowerCase()).filter((marker) => marker !== '');
  const targets = await resolveProductionTargets(profileSet, profiles);
  const verdicts: ProductionProfileVerdict[] = [];

  for (const target of targets) {
    const byName = isProductionTarget({
      label: target.label,
      ...(target.profile !== undefined && { profile: target.profile }),
    });
    const byMarker = markers.some((marker) => target.label.toLowerCase().includes(marker));
    const byAccount = target.accountId !== undefined && isProductionTarget({ label: '-', accountId: target.accountId });

    if (byName || byMarker || byAccount) {
      verdicts.push({ profile: target.label, unresolved: false });
    } else if (target.unresolved === true) {
      verdicts.push({ profile: target.label, unresolved: true });
    }
  }

  return verdicts;
}

/**
 * Words a production refusal, separating real production from an unresolved account.
 *
 * @param verdicts - What {@link findProductionProfileVerdicts} returned
 * @returns A clause such as `these profiles are production: a, b; and the account of c could
 *   not be resolved (expired SSO session or no access), so it is treated as production`
 */
export function formatProductionProfiles(verdicts: ReadonlyArray<ProductionProfileVerdict>): string {
  const production = verdicts.filter((verdict) => !verdict.unresolved).map((verdict) => verdict.profile);
  const unresolved = verdicts.filter((verdict) => verdict.unresolved).map((verdict) => verdict.profile);
  const clauses: string[] = [];

  if (production.length > 0) clauses.push(`these profiles are production: ${production.join(', ')}`);
  if (unresolved.length > 0) {
    clauses.push(
      `the account of ${unresolved.join(', ')} could not be resolved (expired SSO session or no access), ` +
        'so it is treated as production: log in again, or check the profile',
    );
  }

  return clauses.join('; and ');
}
