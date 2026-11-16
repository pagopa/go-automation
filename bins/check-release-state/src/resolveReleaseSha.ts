import { eventField, eventString } from './githubEvent.js';
import { DEVELOP_BRANCH, RELEASE_BRANCH_PREFIX } from './releaseConstants.js';
import { isMergedReleasePull } from './releasePulls.js';
import { assertMergeCommit } from './publishedPackages.js';
import type { GitHubPort } from './types/GitHubPort.js';
import type { GitPort } from './types/GitPort.js';

const COMMIT_SHA = /^[0-9a-f]{40}$/u;

/**
 * The release commit to publish from (§9.3, `resolve-sha`):
 *
 * - on `pull_request` closed: the `merge_commit_sha` of the event, only for a merged release PR from
 *   this repository towards `develop`;
 * - on `workflow_dispatch` (recovery): the `release_sha` input, only when the GitHub API confirms it
 *   is the merge commit of such a PR.
 *
 * A retry therefore always uses the same validated commit. The commit must be a real merge commit
 * (two parents), so that the versions of the whole release PR can be computed.
 *
 * @param eventName - `GITHUB_EVENT_NAME`
 * @param payload - Parsed event payload (`GITHUB_EVENT_PATH`)
 * @param repository - `GITHUB_REPOSITORY` (`owner/name`)
 * @param github - GitHub access
 * @param git - Git access (the commit must be fetched)
 * @returns The validated release commit
 * @throws Error when the origin is not a merged release PR
 */
export async function resolveReleaseSha(
  eventName: string,
  payload: unknown,
  repository: string,
  github: GitHubPort,
  git: GitPort,
): Promise<string> {
  const sha = await originOf(eventName, payload, repository, github);
  assertMergeCommit(git, sha);
  return sha;
}

async function originOf(eventName: string, payload: unknown, repository: string, github: GitHubPort): Promise<string> {
  switch (eventName) {
    case 'pull_request': {
      const merged = eventField(payload, 'pull_request', 'merged') === true;
      const headRef = eventString(payload, 'pull_request', 'head', 'ref');
      const baseRef = eventString(payload, 'pull_request', 'base', 'ref');
      const headRepository = eventField(payload, 'pull_request', 'head', 'repo', 'full_name');
      const sha = eventField(payload, 'pull_request', 'merge_commit_sha');
      if (!merged || typeof sha !== 'string' || !COMMIT_SHA.test(sha))
        throw new Error('the pull request is not merged');
      if (!headRef.startsWith(RELEASE_BRANCH_PREFIX) || baseRef !== DEVELOP_BRANCH || headRepository !== repository) {
        throw new Error(`${headRef} → ${baseRef} is not a release PR of ${repository}`);
      }
      return sha;
    }
    case 'workflow_dispatch': {
      const sha = eventString(payload, 'inputs', 'release_sha').trim().toLowerCase();
      if (!COMMIT_SHA.test(sha)) throw new Error(`release_sha "${sha}" is not a full commit SHA`);
      const pulls = await github.pullsForCommit(sha);
      if (!pulls.some((pull) => isMergedReleasePull(pull) && pull.mergeCommitSha === sha)) {
        throw new Error(`${sha} is not the merge commit of a release/* PR merged into ${DEVELOP_BRANCH}`);
      }
      return sha;
    }
    default:
      throw new Error(`event ${eventName} cannot start a release`);
  }
}
