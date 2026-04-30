/**
 * Standard Format Adapter
 *
 * Adapter for CSV files already in the standard SEND format:
 * - Comma-separated values (,)
 * - Standard SEND column names
 * - Single-line header
 * - No transformations needed
 */

import type { GOCSVListImporterOptions } from '@go-automation/go-common/core';
import type { GOCSVFormatAdapter } from '@go-automation/go-common/core';
import { validateSENDCSVRow } from '../SENDCSVRowValidator.js';

export class StandardFormatAdapter implements GOCSVFormatAdapter {
  getName(): string {
    return 'standard';
  }

  getDescription(): string {
    return 'Standard SEND CSV format (comma-separated, standard column names)';
  }

  canHandle(csvContent: string): boolean {
    if (!csvContent || csvContent.trim().length === 0) {
      return false;
    }

    const firstLine = csvContent.split('\n')[0];

    if (!firstLine) {
      return false;
    }

    // Must use comma delimiter
    if (!firstLine.includes(',')) {
      return false;
    }

    // Check for required standard SEND columns
    const requiredColumns = ['subject', 'senderTaxId', 'recipientTaxId', 'recipientType'];
    const hasAllRequired = requiredColumns.every((col) => firstLine.toLowerCase().includes(col.toLowerCase()));

    return hasAllRequired;
  }

  getOptions(): GOCSVListImporterOptions {
    return {
      delimiter: ',',
      hasHeaders: true,
      skipHeaderRows: 0,
      skipInvalidItems: false,
      encoding: 'utf8',

      // No column mapping needed (already in standard format)
      columnMapping: undefined,

      // No default values needed
      defaultValues: undefined,

      // Use standard SEND validator
      rowValidator: validateSENDCSVRow,

      // No transformation needed
      rowTransformer: undefined,
    };
  }
}
