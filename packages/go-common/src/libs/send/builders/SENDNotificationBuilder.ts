/**
 * Notification Builder for creating notification requests
 */

import type { SENDAttachmentResult } from '../services/attachment/models/SENDAttachmentResult.js';
import type { SENDDigitalDomicile } from '../services/notification/models/SENDDigitalDomicile.js';
import type { SENDNotificationDocument } from '../services/notification/models/SENDNotificationDocument.js';
import { SENDNotificationFeePolicy } from '../services/notification/models/SENDNotificationFeePolicy.js';
import type { SENDNotificationPaymentItem } from '../services/notification/models/SENDNotificationPaymentItem.js';
import type { SENDNotificationRecipient } from '../services/notification/models/SENDNotificationRecipient.js';
import type { SENDNotificationRequest } from '../services/notification/models/SENDNotificationRequest.js';
import { SENDPagoPaIntMode } from '../services/notification/models/SENDPagoPaIntMode.js';
import type { SENDPagoPaPayment } from '../services/notification/models/SENDPagoPaPayment.js';
import type { SENDPhysicalAddress } from '../services/notification/models/SENDPhysicalAddress.js';
import { SENDPhysicalCommunicationType } from '../services/notification/models/SENDPhysicalCommunicationType.js';
import { SENDRecipientType } from '../services/notification/models/SENDRecipientType.js';

/**
 * Builder for creating notification requests with fluent API
 */
export class SENDNotificationBuilder {
  private request: Partial<SENDNotificationRequest>;
  private currentRecipients: SENDNotificationRecipient[] = [];
  private currentDocuments: SENDNotificationDocument[] = [];

  constructor() {
    this.request = {
      recipients: [],
      documents: [],
      physicalCommunicationType: SENDPhysicalCommunicationType.AR_REGISTERED_LETTER,
      notificationFeePolicy: SENDNotificationFeePolicy.FLAT_RATE,
      pagoPaIntMode: SENDPagoPaIntMode.NONE,
      taxonomyCode: '010202N',
    };
  }

  /**
   * Set PA protocol number (unique identifier from sender)
   */
  setProtocolNumber(protocolNumber: string): this {
    this.request.paProtocolNumber = protocolNumber;
    return this;
  }

  /**
   * Generate automatic protocol number based on timestamp
   */
  generateProtocolNumber(): this {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 9999999)
      .toString()
      .padStart(7, '0');
    this.request.paProtocolNumber = `2025${(random + timestamp.substring(0, 13)).padStart(20, '0').substring(0, 20)}`;
    return this;
  }

  /**
   * Set notification subject
   */
  setSubject(subject: string): this {
    this.request.subject = subject;
    return this;
  }

  /**
   * Set notification abstract/summary
   */
  setAbstract(abstract: string): this {
    this.request.abstract = abstract;
    return this;
  }

  /**
   * Set sender information
   */
  setSender(taxId: string, denomination: string): this {
    this.request.senderTaxId = taxId;
    this.request.senderDenomination = denomination;
    return this;
  }

  /**
   * Set physical communication type
   */
  setPhysicalCommunicationType(type: SENDPhysicalCommunicationType): this {
    this.request.physicalCommunicationType = type;
    return this;
  }

  /**
   * Set taxonomy code
   */
  setTaxonomyCode(code: string): this {
    this.request.taxonomyCode = code;
    return this;
  }

  /**
   * Set notification fee policy
   */
  setNotificationFeePolicy(policy: SENDNotificationFeePolicy): this {
    this.request.notificationFeePolicy = policy;
    return this;
  }

  /**
   * Set PA fee (in euro cents)
   */
  setPaFee(fee: number): this {
    this.request.paFee = fee;
    return this;
  }

  /**
   * Set VAT (in euro cents)
   */
  setVat(vat: number): this {
    this.request.vat = vat;
    return this;
  }

  /**
   * Set PagoPA integration mode
   */
  setPagoPaIntMode(mode: SENDPagoPaIntMode): this {
    this.request.pagoPaIntMode = mode;
    return this;
  }

  /**
   * Set group ID (for multi-group PAs)
   */
  setGroup(groupId: string): this {
    this.request.group = groupId;
    return this;
  }

  /**
   * Set payment expiration date
   */
  setPaymentExpirationDate(date: string): this {
    this.request.paymentExpirationDate = date;
    return this;
  }

  /**
   * Add a recipient with physical address (analog notification)
   */
  addAnalogRecipient(
    taxId: string,
    denomination: string,
    address: SENDPhysicalAddress,
    recipientType: SENDRecipientType = SENDRecipientType.PF,
  ): this {
    this.currentRecipients.push({
      taxId,
      denomination,
      recipientType,
      physicalAddress: address,
    });
    return this;
  }

  /**
   * Add a recipient with digital domicile (digital notification)
   * Note: physicalAddress is required by PN API for all recipients
   */
  addDigitalRecipient(
    taxId: string,
    denomination: string,
    address: SENDPhysicalAddress,
    digitalDomicile: SENDDigitalDomicile,
    recipientType: SENDRecipientType = SENDRecipientType.PF,
  ): this {
    this.currentRecipients.push({
      taxId,
      denomination,
      recipientType,
      physicalAddress: address,
      digitalDomicile,
    });
    return this;
  }

  /**
   * Add a recipient with both physical and digital addresses
   */
  addMixedRecipient(
    taxId: string,
    denomination: string,
    address: SENDPhysicalAddress,
    digitalDomicile: SENDDigitalDomicile,
    recipientType: SENDRecipientType = SENDRecipientType.PF,
  ): this {
    this.currentRecipients.push({
      taxId,
      denomination,
      recipientType,
      physicalAddress: address,
      digitalDomicile,
    });
    return this;
  }

  /**
   * Add a payment item to the last recipient
   */
  addPaymentToLastRecipient(payment: SENDNotificationPaymentItem): this {
    const lastRecipient = this.currentRecipients.at(-1);
    if (!lastRecipient) {
      throw new Error('No recipients added. Add a recipient before adding payment.');
    }
    lastRecipient.payments ??= [];
    lastRecipient.payments.push(payment);
    return this;
  }

  /**
   * Add a PagoPA payment to the last recipient (convenience method)
   */
  addPagoPaPaymentToLastRecipient(pagoPa: SENDPagoPaPayment): this {
    return this.addPaymentToLastRecipient({ pagoPa });
  }

  /**
   * Add a document from file upload result
   */
  addDocument(title: string, uploadResult: SENDAttachmentResult, docIdx?: string): this {
    this.currentDocuments.push({
      title,
      contentType: 'application/pdf',
      ref: uploadResult.ref,
      digests: uploadResult.digests,
      docIdx,
    });
    return this;
  }

  /**
   * Add a document manually (if you already have ref and digests)
   */
  addDocumentManual(document: SENDNotificationDocument): this {
    this.currentDocuments.push(document);
    return this;
  }

  /**
   * Validate the notification request
   */
  private validate(): void {
    const errors: string[] = [];

    if (!this.request.paProtocolNumber) {
      errors.push('Protocol number is required. Use setProtocolNumber() or generateProtocolNumber()');
    }
    if (!this.request.subject) {
      errors.push('Subject is required. Use setSubject()');
    }
    if (!this.request.senderTaxId) {
      errors.push('Sender tax ID is required. Use setSender()');
    }
    if (!this.request.senderDenomination) {
      errors.push('Sender denomination is required. Use setSender()');
    }
    if (this.currentRecipients.length === 0) {
      errors.push('At least one recipient is required. Use addAnalogRecipient() or addDigitalRecipient()');
    }
    if (this.currentDocuments.length === 0) {
      errors.push('At least one document is required. Use addDocument()');
    }

    if (errors.length > 0) {
      throw new Error(`Notification validation failed:\n- ${errors.join('\n- ')}`);
    }
  }

  /**
   * Build the notification request
   */
  build(): SENDNotificationRequest {
    this.validate();

    this.request.recipients = this.currentRecipients;
    this.request.documents = this.currentDocuments;

    return this.request as SENDNotificationRequest;
  }

  /**
   * Reset the builder to create a new notification
   */
  reset(): this {
    this.request = {
      recipients: [],
      documents: [],
      physicalCommunicationType: SENDPhysicalCommunicationType.AR_REGISTERED_LETTER,
      notificationFeePolicy: SENDNotificationFeePolicy.FLAT_RATE,
      pagoPaIntMode: SENDPagoPaIntMode.NONE,
      taxonomyCode: '010202N',
    };
    this.currentRecipients = [];
    this.currentDocuments = [];
    return this;
  }
}
