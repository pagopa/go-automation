/**
 * What counts as production, for the gate in front of a production write.
 *
 * Two independent signals, either of which is enough: a production token in
 * the name of the target (`sso_pn-core-prod`), or the account the target's
 * credentials resolve to. The account check is what catches a profile named
 * without any marker at all, which is legal in `~/.aws/config` and is exactly
 * the case a name-only check would wave through.
 */

/**
 * Tokens that name a production environment in an AWS profile or an alarm name.
 *
 * `att` and `test` are the other two environments this team runs; only production is
 * marked, because marking all three would make the marker furniture.
 */
const PRODUCTION_TOKENS: ReadonlyArray<string> = ['prod', 'prd', 'production'];

/**
 * A production marker followed by digits (`prod2`, `core-prod01`, `prd1`).
 *
 * Deliberately not a `startsWith('prod')`: that would flag `producer`, `products` and
 * `produce`, which name alarms and queues that have nothing to do with production.
 */
const NUMBERED_PRODUCTION_TOKEN = /^(prod|prd)\d+$/;

/**
 * The production AWS accounts: SEND core, SEND confinfo, INTEROP, INTEROP
 * safe-storage and the Watchtower/monitoring account.
 *
 * Hardcoded on purpose, against the repo's rule that resource names come from
 * config. This list is a safety floor: a value an operator can override from a
 * config file, a preset or an env var is a floor anybody can lower, and the
 * one place it must not be lowerable is the gate that protects production.
 */
export const GO_PRODUCTION_ACCOUNT_IDS: ReadonlyArray<string> = [
  '510769970275', // SEND core prod
  '350578575906', // SEND confinfo prod
  '697818730278', // INTEROP prod
  '730335668132', // INTEROP safe-storage prod
  '170533023216', // Watchtower / monitoring prod
];

/** Something a write is about to touch, described by every signal the caller has. */
export interface GOProductionTarget {
  /** What the operator sees, and what they must type to confirm a production write */
  readonly label: string;

  /** The AWS profile the write goes through */
  readonly profile?: string;

  /** The AWS account the profile's credentials resolve to */
  readonly accountId?: string;

  /** The endpoint the write goes to */
  readonly url?: string;

  /**
   * The caller's own verdict, for targets only it can classify (a PN API host,
   * the shared Jira board). It can only add: `false` does not clear a match on
   * the other signals.
   */
  readonly isProduction?: boolean;

  /**
   * The target is treated as production only because its account could not be resolved
   * (an expired SSO session, no access), not because any signal says it is. Lets a
   * refusal say so instead of claiming the target "looks like production".
   */
  readonly unresolved?: boolean;
}

/**
 * Whether an identifier names a production environment.
 *
 * Matched on whole tokens rather than with `includes`, so `reproduce-queue` is not a
 * production anything. A token counts when it is one of the markers outright or ends
 * with one, which is what catches `pn-core-prod`, `sso_send-prod` and `interopprd`. A marker
 * followed by digits (`prod2`) counts too.
 *
 * @param name - an AWS profile, an alarm name or any other identifier
 * @returns True when one of the identifier's tokens is a production marker
 */
export function isProductionIdentifier(name: string): boolean {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token !== '')
    .some(
      (token) =>
        NUMBERED_PRODUCTION_TOKEN.test(token) ||
        PRODUCTION_TOKENS.some((marker) => token === marker || token.endsWith(marker)),
    );
}

/**
 * Whether a write target is production, on any of the signals it carries.
 *
 * @param target - the target, as fully described as the caller can
 * @returns True when any signal marks the target as production
 */
export function isProductionTarget(target: GOProductionTarget): boolean {
  if (target.isProduction === true) return true;
  if (target.accountId !== undefined && GO_PRODUCTION_ACCOUNT_IDS.includes(target.accountId)) return true;
  if (isProductionIdentifier(target.label)) return true;
  if (target.profile !== undefined && isProductionIdentifier(target.profile)) return true;

  return target.url !== undefined && isProductionIdentifier(hostOf(target.url));
}

/** The host of a URL, or the raw string when it does not parse as one. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
