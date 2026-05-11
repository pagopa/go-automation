/**
 * Thin wrapper around the Jira Cloud REST API v3 consumed by go-search-jira.
 *
 * Composes:
 *  - `Core.GOHttpClient` for JSON endpoints (issue search, single issue lookup).
 *  - `Core.GOFileDownloader` for binary attachment downloads (streaming + retry).
 *
 * Authorization is injected via `defaultHeaders` once and never logged or
 * surfaced in errors. Pagination on `/rest/api/3/search/jql` is exposed as an
 * async iterable. Jira Data Center / Server is not implemented here because it
 * uses different API paths and `startAt`/`maxResults` pagination.
 */
import { Core } from '@go-automation/go-common';

import type { JiraIssue } from '../types/JiraIssue.js';
import type { JiraAttachment } from '../types/JiraAttachment.js';

import type { JiraClientConfig } from './JiraClientConfig.js';
import type { JiraSearchPage } from './JiraSearchPage.js';

interface RawJiraSearchResponse {
  readonly issues: ReadonlyArray<RawJiraIssue>;
  readonly nextPageToken?: string;
  readonly isLast?: boolean;
}

interface RawJiraIssue {
  readonly key: string;
  readonly fields: {
    readonly summary?: string;
    readonly updated?: string;
    readonly project?: { readonly key?: string };
    readonly attachment?: ReadonlyArray<RawJiraAttachment>;
  };
}

interface RawJiraAttachment {
  readonly id: string;
  readonly filename: string;
  readonly mimeType?: string;
  readonly size?: number;
  readonly created?: string;
  readonly content?: string;
  readonly author?: { readonly displayName?: string };
}

const DEFAULT_PAGE_SIZE = 50;

export class JiraClient {
  private readonly baseUrl: string;
  private readonly http: Core.GOHttpClient;
  private readonly downloader: Core.GOFileDownloader;
  private readonly authorizationHeader: string;

  constructor(config: JiraClientConfig) {
    this.baseUrl = normaliseBaseUrl(config.baseUrl);
    this.authorizationHeader = config.authorizationHeader;

    this.http = new Core.GOHttpClient({
      baseUrl: this.baseUrl,
      defaultHeaders: {
        Authorization: this.authorizationHeader,
        Accept: 'application/json',
      },
      timeout: config.timeoutMs ?? 60_000,
    });

    this.downloader = new Core.GOFileDownloader({
      defaultHeaders: { Authorization: this.authorizationHeader },
      timeoutMs: config.timeoutMs ?? 60_000,
      maxRetries: config.maxRetries ?? 3,
    });
  }

  /**
   * Async iterable yielding every issue that matches the JQL query.
   * Uses Jira Cloud's modern token-based pagination.
   */
  public searchIssues(jql: string, pageSize: number = DEFAULT_PAGE_SIZE): AsyncIterable<JiraIssue> {
    return this.iterateSearchPages(jql, pageSize);
  }

  private async *iterateSearchPages(jql: string, pageSize: number): AsyncIterableIterator<JiraIssue> {
    let nextPageToken: string | undefined;
    do {
      const page = await this.fetchSearchPage(jql, pageSize, nextPageToken);
      for (const issue of page.issues) {
        yield issue;
      }
      nextPageToken = page.nextPageToken;
      if (page.isLast) break;
    } while (nextPageToken !== undefined);
  }

  /**
   * Fetches a single issue by key. Returns `undefined` for 404.
   */
  public async getIssue(issueKey: string): Promise<JiraIssue | undefined> {
    const path = `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,updated,project,attachment`;
    try {
      const raw = await this.http.get<RawJiraIssue>(path);
      return mapIssue(raw);
    } catch (error) {
      if (isHttpError(error, 404)) return undefined;
      throw enrichJiraHttpError(error, `Jira getIssue(${issueKey}) failed`);
    }
  }

  /**
   * Streams an attachment to a local file. Returns sha256, size, attempts.
   */
  public async downloadAttachment(
    attachment: JiraAttachment,
    destPath: string,
    signal?: AbortSignal,
  ): Promise<{ readonly sha256: string; readonly bytesWritten: number; readonly attempts: number }> {
    const result = await this.downloader.downloadToFile(
      attachment.contentUrl,
      destPath,
      signal !== undefined ? { signal } : {},
    );
    return {
      sha256: result.sha256,
      bytesWritten: result.bytesWritten,
      attempts: result.attempts,
    };
  }

  /**
   * Builds an absolute URL to the human-facing Jira issue page.
   */
  public buildIssueUrl(issueKey: string): string {
    return `${this.baseUrl}/browse/${encodeURIComponent(issueKey)}`;
  }

  // ── private ─────────────────────────────────────────────────────────

  private async fetchSearchPage(
    jql: string,
    pageSize: number,
    nextPageToken: string | undefined,
  ): Promise<JiraSearchPage> {
    const params = new URLSearchParams();
    params.set('jql', jql);
    params.set('fields', 'summary,updated,project,attachment');
    params.set('maxResults', String(pageSize));
    if (nextPageToken !== undefined) {
      params.set('nextPageToken', nextPageToken);
    }
    const path = `/rest/api/3/search/jql?${params.toString()}`;
    let raw: RawJiraSearchResponse;
    try {
      raw = await this.http.get<RawJiraSearchResponse>(path);
    } catch (error) {
      throw enrichJiraHttpError(error, `Jira search failed (jql=${jql})`);
    }
    if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.issues)) {
      throw new Error(
        `Unexpected response shape from ${this.baseUrl}${path}: missing "issues" array. ` +
          'Verify that jira.url points to the root of the Atlassian Cloud instance ' +
          '(e.g. https://example.atlassian.net) and that the API token is valid.',
      );
    }
    return {
      issues: raw.issues.map(mapIssue),
      nextPageToken: raw.nextPageToken,
      isLast: raw.isLast === true,
    };
  }
}

/**
 * Re-throws a Jira HTTP error with a richer message that includes the response
 * payload (Jira returns helpful `errorMessages` / `errors` fields on 4xx).
 */
function enrichJiraHttpError(error: unknown, context: string): Error {
  if (error instanceof Error && error.name === 'GOHttpClientError') {
    const httpError = error as Error & { statusCode?: number; response?: unknown };
    const details = formatJiraErrorBody(httpError.response);
    const message = `${context} → ${error.message}${details.length > 0 ? `\n${details}` : ''}`;
    const enriched = new Error(message);
    enriched.name = 'JiraApiError';
    return enriched;
  }
  return error instanceof Error ? error : new Error(String(error));
}

function formatJiraErrorBody(body: unknown): string {
  if (body === null || body === undefined) return '';
  if (typeof body === 'string') {
    const trimmed = body.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 500) : '';
  }
  if (typeof body === 'object') {
    const candidate = body as { errorMessages?: ReadonlyArray<string>; errors?: Record<string, string> };
    const lines: string[] = [];
    if (Array.isArray(candidate.errorMessages)) {
      for (const message of candidate.errorMessages) {
        if (typeof message === 'string' && message.length > 0) lines.push(`  • ${message}`);
      }
    }
    if (candidate.errors !== null && typeof candidate.errors === 'object') {
      for (const [field, message] of Object.entries(candidate.errors)) {
        lines.push(`  • ${field}: ${String(message)}`);
      }
    }
    if (lines.length > 0) return lines.join('\n');
    try {
      return JSON.stringify(body).slice(0, 500);
    } catch {
      return '';
    }
  }
  return '';
}

function mapIssue(raw: RawJiraIssue): JiraIssue {
  const fields = raw.fields ?? {};
  return {
    key: raw.key,
    summary: fields.summary ?? '',
    projectKey: fields.project?.key ?? '',
    updated: fields.updated ?? '',
    attachments: (fields.attachment ?? []).map(mapAttachment),
  };
}

function mapAttachment(raw: RawJiraAttachment): JiraAttachment {
  return {
    id: raw.id,
    filename: raw.filename,
    mimeType: raw.mimeType ?? 'application/octet-stream',
    size: raw.size ?? 0,
    created: raw.created ?? '',
    contentUrl: raw.content ?? '',
    author: raw.author?.displayName,
  };
}

function isHttpError(error: unknown, status: number): boolean {
  if (error === null || typeof error !== 'object') return false;
  const candidate = error as { statusCode?: unknown };
  return candidate.statusCode === status;
}

/**
 * Normalises a Jira Cloud base URL by stripping the trailing slash and any
 * `/jira` (UI) path that users may copy from the browser address bar.
 * Atlassian Cloud REST endpoints always live at the bare host, e.g.
 *   `https://example.atlassian.net/rest/api/3/...`
 * not under `/jira/rest/...`.
 */
function normaliseBaseUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/jira$/i, '');
  return url;
}
