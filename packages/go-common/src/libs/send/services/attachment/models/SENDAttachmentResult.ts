/**
 * SEND Attachment upload result
 */

import type { SENDFileRef } from '../../notification/models/SENDFileRef.js';
import type { SENDFileDigests } from '../../notification/models/SENDFileDigests.js';

export interface SENDAttachmentResult {
  /** SafeStorage file reference */
  ref: SENDFileRef;
  /** File digests (SHA256) */
  digests: SENDFileDigests;
  /** Original file buffer */
  buffer: Buffer;
}
