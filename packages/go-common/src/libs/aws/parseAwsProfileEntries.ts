/** Configured profiles and, for each, where else its log groups may live. */
export interface AWSProfileEntries {
  /** Profile names in declaration order, ready for SSO login and client construction. */
  readonly profileNames: ReadonlyArray<string>;
  /** Fallback tokens declared per profile: a profile name or a 12-digit account id. */
  readonly fallbacksByProfile: ReadonlyMap<string, ReadonlyArray<string>>;
}

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
 * parseAwsProfileEntries(['sso_pn-core-prod', 'sso_pn-confinfo-prod:sso_pn-core-prod']);
 * // profileNames: ['sso_pn-core-prod', 'sso_pn-confinfo-prod']
 * // fallbacksByProfile: Map { 'sso_pn-confinfo-prod' => ['sso_pn-core-prod'] }
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
