import { eventField } from '../githubEvent.js';
import type { FetchFn } from '../types/FetchFn.js';
import type { GitHubPort } from '../types/GitHubPort.js';
import type { PullRequestInfo } from '../types/PullRequestInfo.js';

/** Page size of the GitHub list endpoints (their maximum). */
const PAGE_SIZE = 100;

/** {@link GitHubPort} on the GitHub REST API, read only. */
export class GitHubRestClient implements GitHubPort {
  /**
   * @param fetchFunction - HTTP client
   * @param repository - `owner/name`
   * @param token - Token with `pull-requests: read`
   * @param apiUrl - API root (`GITHUB_API_URL`)
   */
  constructor(
    private readonly fetchFunction: FetchFn,
    private readonly repository: string,
    private readonly token: string,
    private readonly apiUrl: string = 'https://api.github.com',
  ) {}

  public async pullsForCommit(commit: string): Promise<ReadonlyArray<PullRequestInfo>> {
    const body = await this.get(`/repos/${this.repository}/commits/${commit}/pulls?per_page=${String(PAGE_SIZE)}`);
    return this.toPulls(body);
  }

  public async closedPulls(baseRef: string): Promise<ReadonlyArray<PullRequestInfo>> {
    const pulls: PullRequestInfo[] = [];
    for (let page = 1; ; page += 1) {
      const query = `state=closed&base=${encodeURIComponent(baseRef)}&per_page=${String(PAGE_SIZE)}&page=${String(page)}`;
      const batch = this.toPulls(await this.get(`/repos/${this.repository}/pulls?${query}`));
      pulls.push(...batch);
      if (batch.length < PAGE_SIZE) return pulls;
    }
  }

  private async get(pathAndQuery: string): Promise<unknown> {
    if (this.token === '') throw new Error('GITHUB_TOKEN (or GH_TOKEN) is required to read the GitHub API');
    const response = await this.fetchFunction(`${this.apiUrl}${pathAndQuery}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`GitHub API ${pathAndQuery} answered ${String(response.status)}`);
    return response.json();
  }

  private toPulls(body: unknown): ReadonlyArray<PullRequestInfo> {
    if (!Array.isArray(body)) throw new Error('GitHub API returned an unexpected body');
    return body.map((pull: unknown): PullRequestInfo => {
      const mergeCommitSha = eventField(pull, 'merge_commit_sha');
      return {
        number: Number(eventField(pull, 'number')),
        merged: typeof eventField(pull, 'merged_at') === 'string',
        ...(typeof mergeCommitSha === 'string' ? { mergeCommitSha } : {}),
        headRef: stringField(pull, 'head', 'ref'),
        baseRef: stringField(pull, 'base', 'ref'),
        sameRepository: eventField(pull, 'head', 'repo', 'full_name') === this.repository,
      };
    });
  }
}

function stringField(value: unknown, ...keys: ReadonlyArray<string>): string {
  const field = eventField(value, ...keys);
  return typeof field === 'string' ? field : '';
}
