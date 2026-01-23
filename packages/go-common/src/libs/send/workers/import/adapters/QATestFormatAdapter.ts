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

export class QATestFormatAdapter implements GOCSVFormatAdapter {
  getName(): string { return 'qa-test'; }
  getDescription(): string { return 'QA Test format (semicolon-separated, multi-line header, test-specific columns)'; }

  canHandle(csvContent: string): boolean {
    if (!csvContent || csvContent.trim().length === 0) {
      return false;
    }

    const lines = csvContent.split('\n').filter(l => l.trim().length > 0);

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

    // Check for QA-specific columns
    const qaColumns = ['ID_Scenario', 'Scenario', 'Destinatario', 'Denomination', 'Sender', 'Tax ID'];
    const matchCount = qaColumns.filter(col => firstLine.includes(col)).length;

    // At least 4 out of 6 QA columns should be present
    return matchCount >= 4;
  }

  getOptions(): GOCSVListImporterOptions {
    return {
      delimiter: ';',
      hasHeaders: true,

      // Skip first 2 lines before the actual header (line 3)
      skipHeaderRows: 0,

      skipInvalidItems: false,
      encoding: 'utf8',

      // Map QA column names to standard SEND column names
      columnMapping: {
        'Scenario': 'subject',
        'Destinatario': 'recipientTaxId',
        'Denomination': 'recipientDenomination',
        'Indirizzo PEC': 'digitalAddress',
        'CAP': 'physicalZip',
        'Provincia': 'physicalProvince',
        'Citta': 'physicalMunicipality',
        'Stato': 'physicalForeignState',
        'Indirizzo': 'physicalAddress',
        'Sender': 'senderDenomination',
        'Tax ID': 'senderTaxId',
        'physicalCommunicationType': 'physicalCommunicationType',
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
      rowTransformer: (item: Record<string, any>) => {
        // Set digitalType only if digitalAddress is present and not empty
        if (item['digitalAddress'] && item['digitalAddress'].trim() !== '') {
          item['digitalType'] = 'PEC';
        } else {
          // Clear digitalType if no digitalAddress
          item['digitalType'] = '';
        }

        // Normalize physicalForeignState (convert "ITALIA" to empty string for domestic addresses)
        if (item['physicalForeignState']?.toUpperCase() === 'ITALIA') {
          item['physicalForeignState'] = '';
        }

        // Remove QA-specific columns that are not part of SEND format
        delete item['Range'];
        delete item['RequestID'];
        delete item['Data invio Test'];
        delete item['Stato'];
        delete item['Esito'];
        delete item['Note'];

        return item;
      },
    };
  }
}
