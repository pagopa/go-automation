/**
 * Picks, out of the profiles a run was given, the one belonging to a
 * particular account.
 *
 * A read has to run on the account that owns the resource: querying a core
 * table with a confinfo profile does not return less, it fails. Scripts that
 * span both accounts therefore take `aws.profiles` and route each resource,
 * rather than binding every call to whichever profile came first.
 *
 * The markers are configuration, never literals in the code.
 */

/**
 * Finds the profile whose name carries the given account marker.
 *
 * @param profiles - Profiles the run was given
 * @param marker - Fragment identifying the account, from configuration
 * @returns The matching profile
 * @throws Error when no profile matches, or when more than one does
 *
 * @example
 * ```typescript
 * const core = profileForAccount(config.awsProfiles, config.accountsCore);
 * ```
 */
export function profileForAccount(profiles: ReadonlyArray<string>, marker: string): string {
  const matches = profiles.filter((profile) => profile.includes(marker));

  if (matches.length === 0) {
    throw new Error(
      `No profile among [${profiles.join(', ')}] names the '${marker}' account. ` +
        'The read needs the account that owns the resource, not whichever profile came first.',
    );
  }
  if (matches.length > 1) {
    throw new Error(`More than one profile names the '${marker}' account: ${matches.join(', ')}. Pass exactly one.`);
  }

  // Checked above, but the compiler cannot see it through `filter`.
  return matches[0] ?? '';
}
