/**
 * Builder for PagoPA payments
 */

import type { SENDPagoPaPayment } from '../services/notification/models/SENDPagoPaPayment.js';
import type { SENDAttachmentResult } from '../services/attachment/models/SENDAttachmentResult.js';

export class SENDPagoPaPaymentBuilder {
  private payment: Partial<SENDPagoPaPayment>;

  constructor() {
    this.payment = {
      applyCost: false,
    };
  }

  /**
   * Set notice code (18 digits)
   */
  setNoticeCode(noticeCode: string): this {
    if (noticeCode.length !== 18) {
      throw new Error('Notice code must be exactly 18 digits');
    }
    this.payment.noticeCode = noticeCode;
    return this;
  }

  /**
   * Generate automatic notice code based on timestamp
   * Format: 3 + 17 digits (first digit = 3 for PagoPA)
   */
  generateNoticeCode(): this {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 9999999)
      .toString()
      .padStart(7, '0');
    const code = `3${(random + timestamp.substring(3, 13)).padStart(17, '0').substring(0, 17)}`;
    this.payment.noticeCode = code;
    return this;
  }

  /**
   * Set creditor tax ID
   */
  setCreditorTaxId(taxId: string): this {
    this.payment.creditorTaxId = taxId;
    return this;
  }

  /**
   * Set whether to apply cost to citizen
   */
  setApplyCost(applyCost: boolean): this {
    this.payment.applyCost = applyCost;
    return this;
  }

  /**
   * Set PagoPA form (payment slip PDF)
   */
  setPagoPaForm(uploadResult: SENDAttachmentResult): this {
    this.payment.attachment = {
      title: 'Avviso PagoPA',
      contentType: 'application/pdf',
      ref: uploadResult.ref,
      digests: uploadResult.digests,
    };
    return this;
  }

  /**
   * Build the PagoPA payment
   */
  build(): SENDPagoPaPayment {
    if (!this.payment.noticeCode) {
      throw new Error('Notice code is required. Use setNoticeCode() or generateNoticeCode()');
    }
    if (!this.payment.creditorTaxId) {
      throw new Error('Creditor tax ID is required. Use setCreditorTaxId()');
    }

    return this.payment as SENDPagoPaPayment;
  }

  /**
   * Reset the builder
   */
  reset(): this {
    this.payment = {
      applyCost: false,
    };
    return this;
  }
}
