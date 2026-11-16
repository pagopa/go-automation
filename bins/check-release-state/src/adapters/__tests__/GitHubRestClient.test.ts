import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GitHubRestClient } from '../GitHubRestClient.js';
import type { FetchFn } from '../../types/FetchFn.js';

/** Response of a fake `fetch`. */
interface FakeResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

function respond(body: unknown, status = 200): FakeResponse {
  return {
    ok: status < 400,
    status,
    json: async (): Promise<unknown> => {
      await Promise.resolve();
      return body;
    },
  };
}

function pull(number: number, overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  return {
    number,
    merged_at: '2026-11-16T10:00:00Z',
    merge_commit_sha: `${String(number)}`.padStart(40, '0'),
    head: { ref: 'release/x', repo: { full_name: 'pagopa/go-automation' } },
    base: { ref: 'develop' },
    ...overrides,
  };
}

describe('GitHubRestClient', () => {
  it('maps pull requests, marking forks and unmerged ones', async () => {
    const urls: string[] = [];
    const fetchFunction: FetchFn = async (url, init) => {
      await Promise.resolve();
      urls.push(url);
      assert.strictEqual(init.headers['Authorization'], 'Bearer token');
      return respond([pull(1), pull(2, { merged_at: null, merge_commit_sha: null, head: { ref: 'f', repo: null } })]);
    };
    const client = new GitHubRestClient(fetchFunction, 'pagopa/go-automation', 'token', 'https://api.example');
    const pulls = await client.pullsForCommit('abc');
    assert.deepStrictEqual(urls, ['https://api.example/repos/pagopa/go-automation/commits/abc/pulls?per_page=100']);
    assert.deepStrictEqual(pulls[0], {
      number: 1,
      merged: true,
      mergeCommitSha: '1'.padStart(40, '0'),
      headRef: 'release/x',
      baseRef: 'develop',
      sameRepository: true,
    });
    assert.deepStrictEqual(pulls[1], {
      number: 2,
      merged: false,
      headRef: 'f',
      baseRef: 'develop',
      sameRepository: false,
    });
  });

  it('reads every page of the closed pull requests', async () => {
    const pages = [Array.from({ length: 100 }, (_, index) => pull(index + 1)), [pull(101)]];
    const fetchFunction: FetchFn = async (url) => {
      await Promise.resolve();
      return respond(pages[Number(new URL(url).searchParams.get('page')) - 1] ?? []);
    };
    const client = new GitHubRestClient(fetchFunction, 'pagopa/go-automation', 'token');
    assert.strictEqual((await client.closedPulls('develop')).length, 101);
  });

  it('fails without a token and on an error status', async () => {
    const failing: FetchFn = async () => {
      await Promise.resolve();
      return respond({}, 403);
    };
    await assert.rejects(new GitHubRestClient(failing, 'r', '').closedPulls('develop'), /GITHUB_TOKEN/u);
    await assert.rejects(new GitHubRestClient(failing, 'r', 'token').closedPulls('develop'), /answered 403/u);
  });
});
