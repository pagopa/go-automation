/**
 * Builder for F24 metadata
 */

import type { SENDAttachmentResult } from '../services/attachment/models/SENDAttachmentResult.js';
import type { SENDF24Metadata } from '../services/notification/models/SENDF24Metadata.js';

export class SENDF24MetadataBuilder {
  private f24: Partial<SENDF24Metadata>;

  constructor() {
    this.f24 = {};
  }

  /**
   * Set applicant tax ID
   */
  setAppliedTaxId(taxId: string): this {
    this.f24.appliedTaxId = taxId;
    return this;
  }

  /**
   * Set F24 metadata attachment (JSON)
   */
  setMetadataAttachment(uploadResult: SENDAttachmentResult): this {
    this.f24.metadataAttachment = {
      title: 'F24 Metadata',
      contentType: 'application/json',
      ref: uploadResult.ref,
      digests: uploadResult.digests,
    };
    return this;
  }

  /**
   * Build the F24 metadata
   */
  build(): SENDF24Metadata {
    if (!this.f24.metadataAttachment) {
      throw new Error('F24 metadata attachment is required. Use setMetadataAttachment()');
    }

    return this.f24 as SENDF24Metadata;
  }

  /**
   * Reset the builder
   */
  reset(): this {
    this.f24 = {};
    return this;
  }
}
