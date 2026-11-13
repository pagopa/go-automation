/** `(profile: <name>)` suffixes of go-aws errors. */
const PROFILE_SUFFIX = /\s*\(profile: [^)]*\)/gu;
/** `profile: [<name>]` of the AWS SDK credential providers. */
const SDK_PROFILE = /profile: \[[^\]]*\]/gu;
/** `profile '<name>'` of go-aws identity errors. */
const QUOTED_PROFILE = /profile '[^']*'/gu;
/** Characters that can belong to a profile name: a name is replaced only as a whole token. */
const NAME_CHARACTER = /[A-Za-z0-9_.-]/u;
/** Prefix of the `Configured profiles: a, b` lists of go-aws target errors. */
const CONFIGURED_PROFILES = 'Configured profiles: ';

/**
 * Removes local AWS profile names from a message that may leave the host
 * (runbook output, report, Watchtower payload): profile names are local data
 * and stay in the local diagnostics only (EVO-AWSACCT-OPUS-01 §6.1).
 *
 * @param message - Message to clean
 * @param profileNames - Profile names known to the host, replaced only where they appear as whole tokens
 *   (so a profile named `a` never alters `access denied`, which classifies failures)
 * @returns The message without profile names
 *
 * @example
 * ```typescript
 * scrubAwsProfileNames('StartQuery access denied (profile: my-profile)', ['my-profile']);
 * // 'StartQuery access denied'
 * ```
 */
export function scrubAwsProfileNames(message: string, profileNames: ReadonlyArray<string> = []): string {
  let scrubbed = omitConfiguredProfiles(
    message
      .replace(PROFILE_SUFFIX, '')
      .replace(SDK_PROFILE, 'profile: [<profile>]')
      .replace(QUOTED_PROFILE, "profile '<profile>'"),
  );
  const names = [...profileNames].filter((name) => name.trim() !== '').sort((a, b) => b.length - a.length);
  for (const name of names) scrubbed = replaceWholeToken(scrubbed, name);
  return scrubbed;
}

/** Replaces `name` where it is not part of a longer token, in linear time per name. */
function replaceWholeToken(message: string, name: string): string {
  let result = '';
  let from = 0;
  for (let index = message.indexOf(name); index !== -1; index = message.indexOf(name, index + name.length)) {
    const before = index === 0 ? '' : message.charAt(index - 1);
    const after = message.charAt(index + name.length);
    if (NAME_CHARACTER.test(before) || NAME_CHARACTER.test(after)) continue;
    result += `${message.slice(from, index)}<profile>`;
    from = index + name.length;
  }
  return result + message.slice(from);
}

/** Replaces every `Configured profiles: a, b` list (comma-separated names) with `<omitted>`, in linear time. */
function omitConfiguredProfiles(message: string): string {
  let result = '';
  let from = 0;
  for (
    let start = message.indexOf(CONFIGURED_PROFILES);
    start !== -1;
    start = message.indexOf(CONFIGURED_PROFILES, from)
  ) {
    let end = start + CONFIGURED_PROFILES.length;
    for (;;) {
      while (end < message.length && !/[\s,]/u.test(message.charAt(end))) end += 1;
      if (message.startsWith(', ', end)) end += 2;
      else break;
    }
    result += `${message.slice(from, start)}${CONFIGURED_PROFILES}<omitted>`;
    from = end;
  }
  return result + message.slice(from);
}
