/**
 * Runs full-text or literal queries against the local FTS index and enriches
 * each hit with the per-attachment metadata (issue summary, URLs).
 */
import { Core } from '@go-automation/go-common';

import type { JiraClient } from '../jira/JiraClient.js';
import type { AttachmentRepository } from '../storage/AttachmentRepository.js';
import type { SearchResultItem } from '../types/SearchResultItem.js';

export interface SearchServiceQuery {
  readonly query: string;
  readonly mode: 'full-text' | 'literal';
  readonly limit: number;
  readonly project: string;
}

export interface SearchServiceDeps {
  readonly index: Core.GOFtsIndex;
  readonly repository: AttachmentRepository;
  readonly client: JiraClient;
}

export class SearchService {
  constructor(private readonly deps: SearchServiceDeps) {}

  public search(query: SearchServiceQuery): ReadonlyArray<SearchResultItem> {
    const filter: Record<string, string | number> = {};
    if (query.project.length > 0) {
      filter['project_key'] = query.project;
    }

    const hits = this.deps.index.search({
      query: query.query,
      mode: query.mode === 'literal' ? Core.GOFtsIndexSearchMode.LITERAL : Core.GOFtsIndexSearchMode.FULL_TEXT,
      limit: query.limit,
      filter,
    });

    const results: SearchResultItem[] = [];
    for (const hit of hits) {
      const row = this.deps.repository.getAttachment(hit.id);
      if (row === undefined) continue;
      if (row.status !== 'indexed') continue;
      results.push({
        issueKey: row.issueKey,
        summary: row.issueSummary,
        projectKey: row.projectKey,
        attachmentId: row.attachmentId,
        filename: row.filename,
        mimeType: row.mimeType,
        score: hit.score,
        snippet: hit.snippet,
        issueUrl: this.deps.client.buildIssueUrl(row.issueKey),
        attachmentUrl: row.contentUrl,
      });
    }
    return results;
  }
}
