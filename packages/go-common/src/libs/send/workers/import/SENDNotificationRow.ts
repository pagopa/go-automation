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
