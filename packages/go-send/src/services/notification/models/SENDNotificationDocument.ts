import type { SENDFileRef } from './SENDFileRef.js';
import type { SENDFileDigests } from './SENDFileDigests.js';

/**
 * Notification document/attachment
 */
export interface SENDNotificationDocument {
  /** Document title */
  title: string;
  /** Content type (e.g., 'application/pdf') */
  contentType: string;
  /** File reference */
  ref: SENDFileRef;
  /** File digests */
  digests: SENDFileDigests;
  /** Document type code */
  docIdx?: string | undefined;
}
