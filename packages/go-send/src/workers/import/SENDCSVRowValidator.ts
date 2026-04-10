/**
 * Validator for SEND CSV Rows
 *
 * This validator replicates the business logic validation from SENDCSVNotificationImporter.
 * Use this with GOCSVListImporter to get the same validation behavior.
 */

import type { SENDNotificationRow } from './SENDNotificationRow.js';
import { SENDPhysicalCommunicationType } from '../../services/notification/models/SENDPhysicalCommunicationType.js';
import { SENDNotificationFeePolicy } from '../../services/notification/models/SENDNotificationFeePolicy.js';
import { SENDPagoPaIntMode } from '../../services/notification/models/SENDPagoPaIntMode.js';

/**
 * Input type for CSV row validation.
 * All fields are optional since validation checks for required field presence.
 */
type SENDCSVRowInput = Partial<SENDNotificationRow>;

/**
 * Validate SEND CSV row for PagoPa Notifications
 * Throws error if row is invalid
 *
 * @param record - The CSV record to validate
 */
export function validateSENDCSVRow(record: SENDCSVRowInput): void {
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
  const hasPhysicalAddress = !!(record.physicalAddress && record.physicalZip && record.physicalMunicipality);

  if (!hasPhysicalAddress) {
    throw new Error('Physical address required: must have at least physicalAddress, physicalZip, physicalMunicipality');
  }

  // Optional enum field validations (using enum values as source of truth)
  const validPhysicalCommunicationTypes = Object.values(SENDPhysicalCommunicationType);
  if (
    record.physicalCommunicationType &&
    !validPhysicalCommunicationTypes.includes(record.physicalCommunicationType as SENDPhysicalCommunicationType)
  ) {
    throw new Error(`physicalCommunicationType must be one of: ${validPhysicalCommunicationTypes.join(', ')}`);
  }

  const validNotificationFeePolicies = Object.values(SENDNotificationFeePolicy);
  if (
    record.notificationFeePolicy &&
    !validNotificationFeePolicies.includes(record.notificationFeePolicy as SENDNotificationFeePolicy)
  ) {
    throw new Error(`notificationFeePolicy must be one of: ${validNotificationFeePolicies.join(', ')}`);
  }

  const validPagoPaIntModes = Object.values(SENDPagoPaIntMode);
  if (record.pagoPaIntMode && !validPagoPaIntModes.includes(record.pagoPaIntMode as SENDPagoPaIntMode)) {
    throw new Error(`pagoPaIntMode must be one of: ${validPagoPaIntModes.join(', ')}`);
  }

  // Numeric field validations
  if (record.paFee && isNaN(Number(record.paFee))) {
    throw new Error('paFee must be a valid number (euro cents)');
  }

  if (record.vat && isNaN(Number(record.vat))) {
    throw new Error('vat must be a valid number (euro cents)');
  }
}
