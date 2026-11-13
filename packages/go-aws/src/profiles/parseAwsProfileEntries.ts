import type { AWSProfileEntries } from './AWSProfileEntries.js';

/**
 * Parses the `aws.profiles` entries into plain profile names and their declared
 * log-group fallbacks.
 *
 * An entry is either a profile name or the compact form
 * `profile:fallback|fallback`, the same shape the scope targets of
 * `go-rta-check` use. A flat list therefore keeps behaving exactly as before:
 * the fallbacks are opted into by writing them, and every script that only
 * needs credentials reads {@link AWSProfileEntries.profileNames} unchanged.
 *
 * Fallback tokens stay unresolved here on purpose: turning a profile name into
 * its account needs an STS call, which belongs to the AWS provider and not to
 * configuration parsing.
 *
 * Complexity: O(N) in the number of declared tokens — membership goes through
 * sets, while the arrays only carry the order the caller depends on.
 *
 * @param entries - Raw `aws.profiles` values, blanks ignored
 * @returns The profile names and the fallback tokens declared for each
 * @throws Error when an entry names no profile, or declares nothing after `:`
 *
 * @example
 * ```typescript
 * parseAwsProfileEntries(['profile-a', 'profile-b:profile-a']);
 * // profileNames: ['profile-a', 'profile-b']
 * // fallbacksByProfile: Map { 'profile-b' => ['profile-a'] }
 * ```
 */
export function parseAwsProfileEntries(entries: ReadonlyArray<string>): AWSProfileEntries {
  // Sets carry the membership tests, arrays and insertion order carry the
  // result: the profile order drives SSO login and which profile answers for
  // an account, and the fallback order is the order they are tried in.
  const profileNames: string[] = [];
  const declaredProfiles = new Set<string>();
  const fallbacksByProfile = new Map<string, Set<string>>();

  for (const raw of entries) {
    const entry = raw.trim();
    if (entry === '') continue;

    const separator = entry.indexOf(':');
    const profile = (separator === -1 ? entry : entry.slice(0, separator)).trim();
    if (profile === '') {
      throw new Error(`Invalid AWS profile entry "${entry}": the profile name is required`);
    }
    if (!declaredProfiles.has(profile)) {
      declaredProfiles.add(profile);
      profileNames.push(profile);
    }
    if (separator === -1) continue;

    const fallbacks = entry
      .slice(separator + 1)
      .split('|')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (fallbacks.length === 0) {
      throw new Error(`Invalid AWS profile entry "${entry}": declare at least one fallback after ":"`);
    }

    const merged = fallbacksByProfile.get(profile) ?? new Set<string>();
    for (const fallback of fallbacks) {
      // Self-reference is always a no-op, so it is a typo rather than a choice.
      if (fallback === profile) {
        throw new Error(`Invalid AWS profile entry "${entry}": ${profile} cannot be its own fallback`);
      }
      merged.add(fallback);
    }
    fallbacksByProfile.set(profile, merged);
  }

  return {
    profileNames,
    fallbacksByProfile: new Map([...fallbacksByProfile].map(([profile, merged]) => [profile, [...merged]])),
  };
}
