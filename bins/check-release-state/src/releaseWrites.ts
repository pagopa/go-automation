import { channelsToMove, channelTargets } from './channelTargets.js';
import { releaseVersions, tagName } from './publishedPackages.js';
import type { GitPort } from './types/GitPort.js';
import type { ReleaseContext } from './types/ReleaseContext.js';

/**
 * Refuses to write when `HEAD` is not the validated release commit (§9.3: every command that writes
 * a tag or a dist-tag checks it first).
 *
 * @param git - Git access
 * @param releaseSha - The validated release commit
 * @throws Error when `HEAD` is another commit
 */
function assertHeadIsRelease(git: GitPort, releaseSha: string): void {
  const head = git.head();
  if (head !== releaseSha) throw new Error(`HEAD is ${head}, not the release commit ${releaseSha}: nothing written`);
}

/**
 * Creates the missing git tags of the release (§9.3, `reconcile-tags`): for each version decided by
 * the release commit that is on the registry, an annotated `<name>@<version>` tag on that commit.
 * It never tags versions of other releases or versions that are not published.
 *
 * @param context - Git, registry and GitHub access
 * @param releaseSha - The validated release commit, checked out as `HEAD`
 * @returns The tags created; throws when a tag exists on another commit
 */
export function reconcileTags(context: ReleaseContext, releaseSha: string): ReadonlyArray<string> {
  assertHeadIsRelease(context.git, releaseSha);
  const created: string[] = [];
  for (const entry of releaseVersions(context.git, releaseSha)) {
    const tag = tagName(entry);
    const existing = context.git.tagCommit(tag);
    if (existing !== undefined) {
      if (existing !== releaseSha)
        throw new Error(`tag ${tag} points to ${existing}, not to the release ${releaseSha}`);
      continue;
    }
    if (!context.registry.versions(entry.name).includes(entry.version)) continue;
    context.git.createAnnotatedTag(tag, releaseSha, tag);
    created.push(tag);
  }
  return created;
}

/**
 * Moves the dist-tags of the release packages to the expected versions (§9.3, `promote-channels`):
 * `latest` on the highest stable, `next` on the highest `-next.*` above `latest`. Normally a no-op;
 * it matters only when an older release is recovered.
 *
 * @param context - Git, registry and GitHub access
 * @param releaseSha - The validated release commit, checked out as `HEAD`
 * @returns One line per dist-tag moved
 */
export function promoteChannels(context: ReleaseContext, releaseSha: string): ReadonlyArray<string> {
  assertHeadIsRelease(context.git, releaseSha);
  const moved: string[] = [];
  for (const entry of releaseVersions(context.git, releaseSha)) {
    const versions = context.registry.versions(entry.name);
    const moves = channelsToMove(channelTargets(versions), context.registry.distTags(entry.name));
    for (const [channel, version] of moves) {
      context.registry.setDistTag(entry.name, version, channel);
      moved.push(`${entry.name}: ${channel} → ${version}`);
    }
  }
  return moved;
}
