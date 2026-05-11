/**
 * Maps Jira issue/attachment identifiers to deterministic local paths under
 * the cache directory. Filenames are sanitised so issues like spaces, slashes
 * or shell-metacharacters never reach the filesystem.
 *
 * Critically, the sanitiser also defuses path-traversal segments — a raw
 * `..` (or any leading-dot sequence) is replaced with `_` so the joined path
 * can never escape the cache root via `path.join(root, '..')`.
 */
import * as path from 'node:path';

import type { JiraAttachment } from '../types/JiraAttachment.js';

const UNSAFE_FILENAME_CHARS = /[^A-Za-z0-9._-]+/g;
const LEADING_DOTS = /^\.+/;
const MAX_SEGMENT_LENGTH = 200;

export class AttachmentCachePaths {
  constructor(private readonly dataDir: string) {}

  public attachmentsRoot(): string {
    return path.join(this.dataDir, 'attachments');
  }

  public issueDir(issueKey: string): string {
    return path.join(this.attachmentsRoot(), this.sanitise(issueKey));
  }

  public attachmentPath(issueKey: string, attachment: JiraAttachment): string {
    const safeName = this.sanitise(attachment.filename);
    return path.join(this.issueDir(issueKey), `${attachment.id}-${safeName}`);
  }

  private sanitise(value: string): string {
    // 1. Collapse runs of unsafe characters into a single underscore.
    let cleaned = value.replace(UNSAFE_FILENAME_CHARS, '_');
    // 2. Replace any leading-dot run with underscores so the segment can
    //    never be `.`, `..` or a hidden-file traversal vector after
    //    `path.join(root, segment)`. The length is preserved so `.gitignore`
    //    becomes `_gitignore` (not just `gitignore`).
    cleaned = cleaned.replace(LEADING_DOTS, (match) => '_'.repeat(match.length));
    // 3. Defend against the degenerate empty / underscore-only case so we
    //    never emit a zero-length segment that `path.join` would collapse.
    if (cleaned.length === 0) {
      cleaned = '_';
    }
    return cleaned.slice(0, MAX_SEGMENT_LENGTH);
  }
}
