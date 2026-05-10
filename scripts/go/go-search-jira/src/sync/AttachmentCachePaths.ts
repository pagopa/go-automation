/**
 * Maps Jira issue/attachment identifiers to deterministic local paths under
 * the cache directory. Filenames are sanitised so issues like spaces, slashes
 * or shell-metacharacters never reach the filesystem.
 */
import * as path from 'node:path';

import type { JiraAttachment } from '../types/JiraAttachment.js';

const UNSAFE_FILENAME_CHARS = /[^A-Za-z0-9._-]+/g;

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
    return value.replace(UNSAFE_FILENAME_CHARS, '_').slice(0, 200);
  }
}
