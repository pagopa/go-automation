/**
 * Validator for SEND CSV Rows
 *
 * This validator replicates the business logic validation from SENDCSVNotificationImporter.
 * Use this with GOCSVListImporter to get the same validation behavior.
 */

/**
 * Validate SEND CSV row for PagoPa Notifications
 * Throws error if row is invalid
 *
 * @param record - The CSV record to validate
 */
export function validateSENDCSVRow(record: any): void {
  // Required fields validation
  if (!record.subject) {
    throw new Error('Missing required field: subject');
  }
  if (!record.senderTaxId) {
    throw new Error('Missing required field: senderTaxId');
  }
  if (!record.senderDenomination) {
    throw new Error('Missing required field: senderDenomination');
  }
  if (!record.recipientTaxId) {
    throw new Error('Missing required field: recipientTaxId');
  }
  if (!record.recipientType) {
    throw new Error('Missing required field: recipientType');
  }
  if (!record.recipientDenomination) {
    throw new Error('Missing required field: recipientDenomination');
  }

  // Recipient type validation
  if (record.recipientType !== 'PF' && record.recipientType !== 'PG') {
    throw new Error('recipientType must be "PF" or "PG"');
  }

  // Physical address validation (at least address, zip, municipality required)
  const hasPhysicalAddress = !!(
    record.physicalAddress &&
    record.physicalZip &&
    record.physicalMunicipality
  );

  if (!hasPhysicalAddress) {
    throw new Error(
      'Physical address required: must have at least physicalAddress, physicalZip, physicalMunicipality',
    );
  }
}
