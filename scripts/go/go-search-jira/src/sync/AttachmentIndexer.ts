/**
 * Side-effectful component that runs the extract → index pipeline for a
 * downloaded attachment.
 *
 * Steps:
 *   1. Run the registered text extractor for the MIME (or fallback on extension).
 *   2. UPSERT the FTS document with metadata (issue_key, project_key, …).
 *   3. Update the bookkeeping row in `attachments` with status `indexed`,
 *      `content_hash` and `indexed_at`.
 *   4. If `keepRaw` is false, delete the cached binary file.
 */
import * as fs from 'node:fs/promises';
import { Core } from '@go-automation/go-common';

import type { AttachmentRepository } from '../storage/AttachmentRepository.js';
import { AttachmentSyncStatus } from '../types/AttachmentSyncStatus.js';
import type { JiraAttachment } from '../types/JiraAttachment.js';
import type { JiraIssue } from '../types/JiraIssue.js';

export interface AttachmentIndexerInput {
  readonly issue: JiraIssue;
  readonly attachment: JiraAttachment;
  readonly localPath: string;
  readonly contentHash: string;
}

export interface AttachmentIndexerDeps {
  readonly registry: Core.GOTextExtractorRegistry;
  readonly index: Core.GOFtsIndex;
  readonly repository: AttachmentRepository;
  readonly keepRaw: boolean;
  readonly maxTextBytes?: number;
}

export class AttachmentIndexer {
  constructor(private readonly deps: AttachmentIndexerDeps) {}

  public async indexAttachment(input: AttachmentIndexerInput): Promise<void> {
    const nowIso = new Date().toISOString();
    let text = '';
    let extractionFailed = false;
    let failureMessage = '';
    try {
      const result = await this.deps.registry.extract(input.attachment.mimeType, input.localPath, {
        ...(this.deps.maxTextBytes !== undefined ? { maxBytes: this.deps.maxTextBytes } : {}),
      });
      text = result.text;
    } catch (error) {
      extractionFailed = true;
      failureMessage = error instanceof Error ? error.message : 'extraction failed';
    }

    if (!extractionFailed) {
      this.deps.index.upsert({
        id: input.attachment.id,
        content: text,
        metadata: {
          issue_key: input.issue.key,
          project_key: input.issue.projectKey,
          filename: input.attachment.filename,
          mime_type: input.attachment.mimeType,
        },
      });
      this.deps.repository.updateAttachmentStatus(input.attachment.id, {
        status: AttachmentSyncStatus.INDEXED,
        statusReason: null,
        contentHash: input.contentHash,
        indexedAt: nowIso,
      });
    } else {
      this.deps.repository.updateAttachmentStatus(input.attachment.id, {
        status: AttachmentSyncStatus.FAILED,
        statusReason: `extract_error: ${failureMessage.slice(0, 240)}`,
        contentHash: input.contentHash,
      });
    }

    if (!this.deps.keepRaw) {
      await this.bestEffortUnlink(input.localPath);
    }
  }

  private async bestEffortUnlink(filePath: string): Promise<void> {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- intentional: removes the cached binary we just downloaded
      await fs.unlink(filePath);
    } catch {
      /* file may not exist */
    }
  }
}
