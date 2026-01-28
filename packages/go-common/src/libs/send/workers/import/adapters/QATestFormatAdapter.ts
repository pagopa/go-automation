/**
 * QA Test Format Adapter
 *
 * Adapter for QA test CSV files with the following characteristics:
 * - Semicolon-separated values (;)
 * - Multi-line header (3 rows total, actual header is the 3rd row)
 * - Different column names than standard SEND format
 * - Contains extra QA/test columns that need to be ignored
 *
 * Transformations applied:
 * - Maps QA column names to standard SEND column names
 * - Sets default values for missing required fields
 * - Normalizes data (e.g., "ITALIA" → empty string for domestic addresses)
 */

import type { GOCSVFormatAdapter } from '../../../../core/importers/csv/GOCSVFormatAdapter.js';
import type { GOCSVListImporterOptions } from '../../../../core/importers/csv/GOCSVListImporterOptions.js';
import { validateSENDCSVRow } from '../SENDCSVRowValidator.js';
import type { SENDNotificationRow } from '../SENDNotificationRow.js';

export class QATestFormatAdapter implements GOCSVFormatAdapter<SENDNotificationRow> {
  getName(): string {
    return 'qa-test';
  }
  getDescription(): string {
    return 'QA Test format (semicolon-separated, multi-line header, test-specific columns)';
  }

  canHandle(csvContent: string): boolean {
    if (!csvContent || csvContent.trim().length === 0) {
      return false;
    }

    const lines = csvContent.split('\n').filter((l) => l.trim().length > 0);

    if (lines.length < 4) {
      return false;
    }

    // Check first line for characteristic QA columns
    // Safe to assert non-null: array length is at least 4
    const firstLine = lines[0]!;

    // Must use semicolon delimiter
    if (!firstLine.includes(';')) {
      return false;
    }

    if (!firstLine.includes(',')) {
      return false;
    }

    // Check for QA-specific columns
    const qaColumns = [
      'ID_Scenario',
      'Scenario',
      'Destinatario',
      'Denomination',
      'Sender',
      'Tax ID',
    ];
    const matchCount = qaColumns.filter((col) => firstLine.includes(col)).length;

    // At least 4 out of 6 QA columns should be present
    return matchCount >= 4;
  }

  getOptions(): GOCSVListImporterOptions<SENDNotificationRow> {
    return {
      delimiter: ',',
      hasHeaders: true,

      // Skip first 2 lines before the actual header (line 3)
      skipHeaderRows: 0,

      skipInvalidItems: false,
      encoding: 'utf8',

      // Map QA column names to standard SEND column names
      columnMapping: {
        Scenario: 'subject',
        Destinatario: 'recipientTaxId',
        Denomination: 'recipientDenomination',
        'Indirizzo PEC': 'digitalAddress',
        CAP: 'physicalZip',
        Provincia: 'physicalProvince',
        Citta: 'physicalMunicipality',
        Stato: 'physicalForeignState',
        Indirizzo: 'physicalAddress',
        Sender: 'senderDenomination',
        'Tax ID': 'senderTaxId',
        physicalCommunicationType: 'physicalCommunicationType',
        //'ID_Scenario': 'paProtocolNumber',
      },

      // Set default values for required fields that are not in the QA format
      defaultValues: {
        recipientType: 'PF',
        documentKey: 'PN_NOTIFICATION_ATTACHMENTS-2d278594387b4a55a062981236165af8.pdf',
        documentVersionToken: 'v1',
        documentSha256: 'B916a8083NjVXZV0nDm7iSRU0ijXZUGFyGvXvIvneBs=',
        group: '695fcc3d48f30c04cb3fbca4',
        physicalMunicipalityDetails: 'Roma',
      },

      // Use standard SEND validator
      rowValidator: validateSENDCSVRow,

      // Additional transformations after mapping and defaults
      rowTransformer: (item: Record<string, string>): SENDNotificationRow => {
        // Set digitalType only if digitalAddress is present and not empty
        const digitalAddress = item['digitalAddress'];
        const digitalType =
          digitalAddress !== undefined && digitalAddress.trim() !== '' ? 'PEC' : undefined;

        // Normalize physicalForeignState (convert "ITALIA" to empty string for domestic addresses)
        const physicalForeignState = item['physicalForeignState'];
        const normalizedPhysicalForeignState =
          physicalForeignState?.toUpperCase() === 'ITALIA' ? '' : physicalForeignState;

        // Build the SENDNotificationRow from the mapped item
        // Required fields
        const row: SENDNotificationRow = {
          subject: item['subject'] ?? '',
          senderTaxId: item['senderTaxId'] ?? '',
          senderDenomination: item['senderDenomination'] ?? '',
          recipientTaxId: item['recipientTaxId'] ?? '',
          recipientType: (item['recipientType'] as 'PF' | 'PG') ?? 'PF',
          recipientDenomination: item['recipientDenomination'] ?? '',
        };

        // Optional fields - only add if they have values
        if (item['group']) row.group = item['group'];
        if (item['taxonomyCode']) row.taxonomyCode = item['taxonomyCode'];
        if (item['paProtocolNumber']) row.paProtocolNumber = item['paProtocolNumber'];

        // Physical address fields
        if (item['physicalAddress']) row.physicalAddress = item['physicalAddress'];
        if (item['physicalAddressDetails'])
          row.physicalAddressDetails = item['physicalAddressDetails'];
        if (item['physicalZip']) row.physicalZip = item['physicalZip'];
        if (item['physicalMunicipality']) row.physicalMunicipality = item['physicalMunicipality'];
        if (item['physicalMunicipalityDetails'])
          row.physicalMunicipalityDetails = item['physicalMunicipalityDetails'];
        if (item['physicalProvince']) row.physicalProvince = item['physicalProvince'];
        if (normalizedPhysicalForeignState)
          row.physicalForeignState = normalizedPhysicalForeignState;

        // Digital domicile fields
        if (digitalType) row.digitalType = digitalType;
        if (digitalAddress) row.digitalAddress = digitalAddress;

        // Payment fields
        if (item['pagoPaNoticeCode']) row.pagoPaNoticeCode = item['pagoPaNoticeCode'];
        if (item['pagoPaCreditorTaxId']) row.pagoPaCreditorTaxId = item['pagoPaCreditorTaxId'];
        if (item['pagoPaAmount']) row.pagoPaAmount = item['pagoPaAmount'];

        // Document fields
        if (item['documentTitle']) row.documentTitle = item['documentTitle'];
        if (item['documentKey']) row.documentKey = item['documentKey'];
        if (item['documentVersionToken']) row.documentVersionToken = item['documentVersionToken'];
        if (item['documentSha256']) row.documentSha256 = item['documentSha256'];
        if (item['documentFilePath']) row.documentFilePath = item['documentFilePath'];

        return row;
      },
    };
  }
}
