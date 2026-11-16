import semver from 'semver';

import { PRERELEASE_TAG } from './releaseConstants.js';
import type { ChannelTargets } from './types/ChannelTargets.js';

/**
 * Where the dist-tags must point, from every published version of a package (§9.3, `promote-channels`):
 * `latest` is the highest stable version, `next` the highest `-next.*` version, only when it is greater
 * than `latest`. Versions that are not valid semver are ignored.
 *
 * @param versions - Every version on the registry
 * @returns The expected channels
 */
export function channelTargets(versions: ReadonlyArray<string>): ChannelTargets {
  let latest: string | undefined;
  let next: string | undefined;
  for (const version of versions) {
    if (semver.valid(version) === null) continue;
    const prerelease = semver.prerelease(version);
    if (prerelease === null) {
      if (latest === undefined || semver.gt(version, latest)) latest = version;
    } else if (prerelease[0] === PRERELEASE_TAG && (next === undefined || semver.gt(version, next))) {
      next = version;
    }
  }
  const nextAhead = next !== undefined && (latest === undefined || semver.gt(next, latest)) ? next : undefined;
  return {
    ...(latest === undefined ? {} : { latest }),
    ...(nextAhead === undefined ? {} : { next: nextAhead }),
  };
}

/**
 * The dist-tags that differ from their target. A channel without a target is not checked: before the
 * first stable version `latest` is whatever the registry set, and an old `next` behind `latest` is left.
 *
 * @param targets - Expected channels
 * @param distTags - Current dist-tags
 * @returns `[channel, expected version]` for each channel to move
 */
export function channelsToMove(
  targets: ChannelTargets,
  distTags: Readonly<Record<string, string>>,
): ReadonlyArray<readonly [string, string]> {
  const moves: (readonly [string, string])[] = [];
  for (const [channel, version] of Object.entries(targets)) {
    if (typeof version === 'string' && distTags[channel] !== version) moves.push([channel, version]);
  }
  return moves;
}
