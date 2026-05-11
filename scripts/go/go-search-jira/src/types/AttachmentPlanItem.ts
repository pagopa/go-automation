import type { JiraAttachment } from './JiraAttachment.js';
import type { AttachmentSkipReasonValue } from './AttachmentSyncStatus.js';

/**
 * Decision taken by AttachmentPlanner for a single attachment.
 */
export type AttachmentPlanItem =
  | { readonly action: 'download'; readonly issueKey: string; readonly attachment: JiraAttachment }
  | { readonly action: 'force-download'; readonly issueKey: string; readonly attachment: JiraAttachment }
  | {
      readonly action: 'skip';
      readonly issueKey: string;
      readonly attachment: JiraAttachment;
      readonly reason: AttachmentSkipReasonValue;
    };
