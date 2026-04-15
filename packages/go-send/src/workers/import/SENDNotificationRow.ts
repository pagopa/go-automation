/**
 * CSV Row Structure
 * Defines the expected column structure for CSV imports
 */

/**
 * CSV row structure (expected columns)
 */
export interface SENDNotificationRow {
  // Notification metadata
  subject: string;
  senderTaxId: string;
  senderDenomination: string;
  group?: string;
  taxonomyCode?: string;
  paProtocolNumber?: string;

  // Recipient data
  recipientTaxId: string;
  recipientType: 'PF' | 'PG';
  recipientDenomination: string;

  // Notification optional metadata
  /** Abstract/summary of the notification */
  abstract?: string;
  /** Physical communication type: AR_REGISTERED_LETTER or REGISTERED_LETTER_890 */
  physicalCommunicationType?: 'AR_REGISTERED_LETTER' | 'REGISTERED_LETTER_890';
  /** Notification fee policy: FLAT_RATE or DELIVERY_MODE */
  notificationFeePolicy?: 'FLAT_RATE' | 'DELIVERY_MODE';
  /** PA fee in euro cents (string from CSV, converted to number for API) */
  paFee?: string;
  /** VAT in euro cents (string from CSV, converted to number for API) */
  vat?: string;
  /** PagoPA integration mode: NONE, SYNC or ASYNC */
  pagoPaIntMode?: 'NONE' | 'SYNC' | 'ASYNC';
  /** Payment expiration date */
  paymentExpirationDate?: string;

  // Physical address (for analog/mixed)
  physicalAddress?: string;
  physicalAddressDetails?: string;
  physicalZip?: string;
  physicalMunicipality?: string;
  physicalMunicipalityDetails?: string;
  physicalProvince?: string;
  physicalForeignState?: string;

  // Digital domicile (for digital/mixed)
  digitalType?: 'PEC' | 'SERCQ' | 'APPIO' | 'REM';
  digitalAddress?: string;

  // Payment (optional)
  pagoPaNoticeCode?: string;
  pagoPaCreditorTaxId?: string;
  pagoPaAmount?: string;

  // Document reference (option 1: already uploaded)
  documentTitle?: string;
  documentKey?: string;
  documentVersionToken?: string;
  documentSha256?: string;

  // Document reference (option 2: file to upload)
  documentFilePath?: string;

  /**
   * Original CSV row data preserved from import.
   * Contains all columns from the original CSV file before transformation.
   * This is populated when GOCSVListImporter is configured with `preserveOriginalData: true`.
   *
   * Useful for CSV passthrough scenarios where you want to preserve all original
   * columns in the output, including those not mapped to standard fields.
   */
  _originalRow?: Record<string, string>;
}
