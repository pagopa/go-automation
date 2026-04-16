import type { SENDNotificationDocument } from './SENDNotificationDocument.js';

/**
 * F24 metadata
 */
export interface SENDF24Metadata {
  /** Applicant tax ID */
  appliedTaxId?: string;
  /** F24 metadata attachment (JSON) */
  metadataAttachment?: SENDNotificationDocument;
}
