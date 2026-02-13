/**
 * Row Processor - Handles single row processing
 */

import { SENDNotifications } from '../../SENDNotifications.js';
import { SENDNotificationBuilder } from '../../builders/SENDNotificationBuilder.js';
import type { SENDNotificationRow } from './SENDNotificationRow.js';
import type { SENDAttachmentResult } from '../../services/attachment/models/SENDAttachmentResult.js';
import type { SENDNotificationRequest } from '../../services/notification/models/SENDNotificationRequest.js';
import type { SENDPhysicalAddress } from '../../services/notification/models/SENDPhysicalAddress.js';
import { SENDRecipientType } from '../../services/notification/models/SENDRecipientType.js';
import { SENDDigitalDomicileType } from '../../services/notification/models/SENDDigitalDomicileType.js';
import { SENDPhysicalCommunicationType } from '../../services/notification/models/SENDPhysicalCommunicationType.js';
import { SENDNotificationFeePolicy } from '../../services/notification/models/SENDNotificationFeePolicy.js';
import { SENDPagoPaIntMode } from '../../services/notification/models/SENDPagoPaIntMode.js';
import type { SENDNotificationImportWorkerOptions } from './SENDNotificationImportWorkerOptions.js';
import { GOEventEmitterBase } from '../../../core/events/GOEventEmitterBase.js';
import type { SENDNotificationImportWorkerEventMap } from './SENDNotificationImportWorkerEvents.js';

export interface ProcessRowResult {
  row: SENDNotificationRow;
  docUploaded: boolean;
  notificationResult: { notificationRequestId: string; iun?: string | undefined } | null;
}

/**
 * Options for toExportRow function
 */
export interface ToExportRowOptions {
  /**
   * If true, only export rows that have a valid IUN.
   * If false, export all rows regardless of IUN status.
   * @default true
   */
  requireIun?: boolean;

  /**
   * Include status information in the export (processing status, error messages).
   * Useful for tracking which rows succeeded or failed.
   * @default false
   */
  includeStatus?: boolean;

  /**
   * Error message to include when includeStatus is true.
   * Only used when the row processing failed.
   */
  errorMessage?: string;
}

/**
 * Convert ProcessRowResult to export row format
 * Maps imported CSV row data and adds generated IUN for export.
 *
 * When the row has `_originalRow` data (from CSV passthrough), this function
 * preserves it in the output so the exporter can merge original columns.
 *
 * @param result - The processing result containing row data and IUN
 * @param options - Export options
 * @returns Export row object or null if requirements not met
 */
export function toExportRow(
  result: ProcessRowResult,
  options: ToExportRowOptions = {},
): Record<string, unknown> | null {
  const { requireIun = true, includeStatus = false, errorMessage } = options;

  // Check IUN requirement
  if (requireIun && !result.notificationResult?.iun) return null;

  // Cast row to CSVRow to access all fields
  const csvRow = result.row;

  // Build the export row with generated/processed data
  const exportRow: Record<string, unknown> = {
    // Generated fields (from notification processing)
    iun: result.notificationResult?.iun ?? '',
    notificationRequestId: result.notificationResult?.notificationRequestId ?? '',

    // Standard notification fields
    subject: csvRow.subject,
    senderTaxId: csvRow.senderTaxId,
    senderDenomination: csvRow.senderDenomination,
    group: csvRow.group,
    taxonomyCode: csvRow.taxonomyCode,
    paProtocolNumber: csvRow.paProtocolNumber,
    recipientTaxId: csvRow.recipientTaxId,
    recipientType: csvRow.recipientType,
    recipientDenomination: csvRow.recipientDenomination,
    physicalAddress: csvRow.physicalAddress,
    physicalAddressDetails: csvRow.physicalAddressDetails,
    physicalZip: csvRow.physicalZip,
    physicalMunicipality: csvRow.physicalMunicipality,
    physicalMunicipalityDetails: csvRow.physicalMunicipalityDetails,
    physicalProvince: csvRow.physicalProvince,
    physicalForeignState: csvRow.physicalForeignState,
    digitalType: csvRow.digitalType,
    digitalAddress: csvRow.digitalAddress,
    pagoPaNoticeCode: csvRow.pagoPaNoticeCode,
    pagoPaCreditorTaxId: csvRow.pagoPaCreditorTaxId,
    pagoPaAmount: csvRow.pagoPaAmount,
    documentTitle: csvRow.documentTitle,
    documentKey: csvRow.documentKey,
    documentVersionToken: csvRow.documentVersionToken,
    documentSha256: csvRow.documentSha256,
    documentFilePath: csvRow.documentFilePath,

    // Notification optional metadata
    abstract: csvRow.abstract,
    physicalCommunicationType: csvRow.physicalCommunicationType,
    notificationFeePolicy: csvRow.notificationFeePolicy,
    paFee: csvRow.paFee,
    vat: csvRow.vat,
    pagoPaIntMode: csvRow.pagoPaIntMode,
    paymentExpirationDate: csvRow.paymentExpirationDate,
  };

  // Add status fields if requested
  if (includeStatus) {
    exportRow['_status'] = result.notificationResult?.iun ? 'SUCCESS' : 'FAILED';
    exportRow['_processedAt'] = new Date().toISOString();
    if (errorMessage) {
      exportRow['_errorMessage'] = errorMessage;
    }
  }

  // Preserve original row data for CSV passthrough
  // This allows the exporter to merge original columns with generated ones
  if (csvRow._originalRow) {
    exportRow['_originalRow'] = csvRow._originalRow;
  }

  return exportRow;
}

export class SENDNotificationImportRowProcessor extends GOEventEmitterBase<SENDNotificationImportWorkerEventMap> {
  constructor(private readonly sdk: SENDNotifications) {
    super();
  }

  async processRow(row: SENDNotificationRow, options?: SENDNotificationImportWorkerOptions): Promise<ProcessRowResult> {
    // Step 1: Handle document - upload new file or use existing document reference
    const documentRef = await this.handleDocument(row);
    const docUploaded = this.hasDocumentFilePath(row) && !!documentRef;

    // Step 2: Build notification request object with all row data (sender, recipient, payment, document)
    const notification = this.buildNotification(row, documentRef);
    let notificationResult: { notificationRequestId: string; iun?: string | undefined } | null = null;

    // Step 3: Send notification to PN API if enabled
    if (options?.sendNotifications) {
      const response = await this.sdk.notifications.sendNotification(notification);
      notificationResult = { notificationRequestId: response.notificationRequestId };
      this.emit('worker:notification:sent', { row, response });

      // Step 4: Poll for IUN if enabled (waits until notification is fully processed)
      // IUN is the unique identifier assigned by PN after notification is accepted
      if (options.pollForIun) {
        const maxAttempts = options.pollMaxAttempts ?? 8;
        try {
          const iun = await this.sdk.notifications.pollForIun(response.notificationRequestId, {
            maxAttempts,
            delayMs: options.pollDelayMs ?? 30000,
            onAttempt: (attempt, status) => {
              this.emit('worker:iun:polling:attempt', {
                row,
                notificationRequestId: response.notificationRequestId,
                attempt,
                maxAttempts,
                status: status.notificationRequestStatus || 'UNKNOWN',
                iunFound: !!status.iun,
                errors: status.errors,
              });
            },
          });
          notificationResult.iun = iun;
          this.emit('worker:iun:obtained', {
            row,
            notificationRequestId: response.notificationRequestId,
            iun,
          });
        } catch (error) {
          const errorMessage = (error as Error).message;
          this.emit('worker:iun:polling:failed', {
            row,
            notificationRequestId: response.notificationRequestId,
            attempts: maxAttempts,
            error: errorMessage,
          });
          throw error;
        }
      }
    }

    return { row, docUploaded, notificationResult };
  }

  private async handleDocument(row: SENDNotificationRow): Promise<SENDAttachmentResult> {
    if (!this.isCSVRow(row)) throw new Error('Only CSVRow supported');

    if (row.documentFilePath) {
      const uploadResult = await this.sdk.attachment.uploadPDF(row.documentFilePath);
      this.emit('worker:document:uploaded', { row, uploadResult });
      return uploadResult;
    }

    if (row.documentKey && row.documentVersionToken && row.documentSha256) {
      return {
        ref: {
          key: row.documentKey,
          versionToken: row.documentVersionToken,
        },
        digests: {
          sha256: row.documentSha256,
        },
        buffer: Buffer.from(''),
      };
    }

    throw new Error(
      'Document required: CSV must include either documentFilePath OR (documentKey + documentVersionToken + documentSha256)',
    );
  }

  private buildNotification(row: SENDNotificationRow, documentRef: SENDAttachmentResult): SENDNotificationRequest {
    if (!this.isCSVRow(row)) throw new Error('Only CSVRow supported');

    const builder = new SENDNotificationBuilder();

    // Set basic notification metadata
    builder.setSubject(row.subject);
    builder.setSender(row.senderTaxId, row.senderDenomination);

    // Set protocol number (use provided or generate new one)
    if (row.paProtocolNumber) builder.setProtocolNumber(row.paProtocolNumber);
    else builder.generateProtocolNumber();

    // Set optional metadata
    if (row.group) builder.setGroup(row.group);
    if (row.taxonomyCode) builder.setTaxonomyCode(row.taxonomyCode);
    if (row.abstract) builder.setAbstract(row.abstract);
    if (row.physicalCommunicationType) {
      builder.setPhysicalCommunicationType(row.physicalCommunicationType as SENDPhysicalCommunicationType);
    }
    if (row.notificationFeePolicy) {
      builder.setNotificationFeePolicy(row.notificationFeePolicy as SENDNotificationFeePolicy);
    }
    if (row.paFee) builder.setPaFee(Number(row.paFee));
    if (row.vat) builder.setVat(Number(row.vat));
    if (row.pagoPaIntMode) {
      builder.setPagoPaIntMode(row.pagoPaIntMode as SENDPagoPaIntMode);
    }
    if (row.paymentExpirationDate) builder.setPaymentExpirationDate(row.paymentExpirationDate);

    // Validate and extract physical address (required for both analog and mixed)
    const physicalAddress = row.physicalAddress;
    const physicalZip = row.physicalZip;
    const physicalMunicipality = row.physicalMunicipality;

    const hasPhysicalAddress = !!(physicalAddress && physicalZip && physicalMunicipality);

    // Validate and extract digital domicile (required for mixed delivery)
    const digitalType = row.digitalType;
    const digitalAddress = row.digitalAddress;
    const hasDigitalDomicile = !!(digitalType && digitalAddress);

    // Add recipient with appropriate delivery method
    // Mixed: both physical (analog) and digital delivery
    // Analog: only physical delivery (registered mail)
    if (hasPhysicalAddress && hasDigitalDomicile) {
      // Safe: hasPhysicalAddress guarantees address and municipality are defined
      const physicalAddressObj = this.buildPhysicalAddress(row, physicalAddress, physicalMunicipality);
      builder.addMixedRecipient(
        row.recipientTaxId,
        row.recipientDenomination,
        physicalAddressObj,
        {
          type: digitalType as SENDDigitalDomicileType,
          address: digitalAddress,
        },
        row.recipientType as SENDRecipientType,
      );
    } else if (hasPhysicalAddress) {
      // Safe: hasPhysicalAddress guarantees address and municipality are defined
      const physicalAddressObj = this.buildPhysicalAddress(row, physicalAddress, physicalMunicipality);
      builder.addAnalogRecipient(
        row.recipientTaxId,
        row.recipientDenomination,
        physicalAddressObj,
        row.recipientType as SENDRecipientType,
      );
    } else {
      throw new Error('Recipient must have at least a physical address');
    }

    // Add payment information if present (PagoPa notice)
    if (row.pagoPaNoticeCode && row.pagoPaCreditorTaxId && row.pagoPaAmount) {
      builder.addPagoPaPaymentToLastRecipient({
        noticeCode: row.pagoPaNoticeCode,
        creditorTaxId: row.pagoPaCreditorTaxId,
        applyCost: true,
      });
    }

    // Attach document and build final notification request
    builder.addDocument(row.documentTitle ?? 'Document', documentRef);
    return builder.build();
  }

  private buildPhysicalAddress(
    row: SENDNotificationRow,
    address: string | undefined,
    municipality: string | undefined,
  ): SENDPhysicalAddress {
    // Safe: caller guarantees address and municipality are defined via hasPhysicalAddress check
    const obj: SENDPhysicalAddress = {
      address: address!, // Safe: validated by hasPhysicalAddress
      municipality: municipality!, // Safe: validated by hasPhysicalAddress
    };
    if (row.physicalAddressDetails) obj.addressDetails = row.physicalAddressDetails;
    if (row.physicalZip) obj.zip = row.physicalZip;
    if (row.physicalMunicipalityDetails) obj.municipalityDetails = row.physicalMunicipalityDetails;
    if (row.physicalProvince) obj.province = row.physicalProvince;
    if (row.physicalForeignState) obj.foreignState = row.physicalForeignState;
    return obj;
  }

  private isCSVRow(row: SENDNotificationRow): row is SENDNotificationRow {
    return 'subject' in row && 'senderTaxId' in row;
  }

  private hasDocumentFilePath(row: SENDNotificationRow): boolean {
    return this.isCSVRow(row) && !!row.documentFilePath;
  }
}
