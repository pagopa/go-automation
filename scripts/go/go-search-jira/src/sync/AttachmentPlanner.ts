/**
 * Pure-function planner that decides what to do with each attachment of an
 * issue: download (new), skip (already-indexed / unsupported / too large) or
 * force-download (when --force is set).
 *
 * Pure & side-effect free: takes a `hasInIndex` predicate and returns a list
 * of `AttachmentPlanItem` decisions. Easy to unit test without mocks.
 */
import { AttachmentSkipReason, type AttachmentSkipReasonValue } from '../types/AttachmentSyncStatus.js';
import type { AttachmentPlanItem } from '../types/AttachmentPlanItem.js';
import type { JiraAttachment } from '../types/JiraAttachment.js';
import type { JiraIssue } from '../types/JiraIssue.js';

/**
 * Predicate returning true if the registry can extract text for the given
 * MIME type / filename.
 */
type CanExtractPredicate = (mimeType: string, filename: string) => boolean;

/**
 * Predicate returning true if the attachment id is already present in the
 * local index.
 */
type HasInIndexPredicate = (attachmentId: string) => boolean;

export interface AttachmentPlannerOptions {
  /** When true, every attachment goes through download/index again. */
  readonly force: boolean;
  /** Hard cap (bytes). Larger attachments get skipped with `too_large`. */
  readonly maxAttachmentSizeBytes: number;
  /**
   * Returns true when the registry can extract text from the file. Attachments
   * returning false are skipped with `unsupported_mime`.
   */
  readonly canExtract: CanExtractPredicate;
  /**
   * Returns true when the attachment id is already in the local index. The
   * attachment is skipped (with `already_indexed`) unless --force is set.
   */
  readonly hasInIndex: HasInIndexPredicate;
}

export class AttachmentPlanner {
  /**
   * Builds the plan for a single issue.
   */
  public planForIssue(issue: JiraIssue, options: AttachmentPlannerOptions): ReadonlyArray<AttachmentPlanItem> {
    const decisions: AttachmentPlanItem[] = [];
    for (const attachment of issue.attachments) {
      decisions.push(this.classify(issue.key, attachment, options));
    }
    return decisions;
  }

  private classify(
    issueKey: string,
    attachment: JiraAttachment,
    options: AttachmentPlannerOptions,
  ): AttachmentPlanItem {
    if (attachment.size > options.maxAttachmentSizeBytes) {
      return this.skip(issueKey, attachment, AttachmentSkipReason.TOO_LARGE);
    }
    if (!options.canExtract(attachment.mimeType, attachment.filename)) {
      return this.skip(issueKey, attachment, AttachmentSkipReason.UNSUPPORTED_MIME);
    }
    if (options.hasInIndex(attachment.id) && !options.force) {
      return this.skip(issueKey, attachment, AttachmentSkipReason.ALREADY_INDEXED);
    }
    if (options.force) {
      return { action: 'force-download', issueKey, attachment };
    }
    return { action: 'download', issueKey, attachment };
  }

  private skip(issueKey: string, attachment: JiraAttachment, reason: AttachmentSkipReasonValue): AttachmentPlanItem {
    return { action: 'skip', issueKey, attachment, reason };
  }
}
