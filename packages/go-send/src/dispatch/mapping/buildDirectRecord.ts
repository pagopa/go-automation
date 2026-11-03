import type { DirectReturnAddress } from '../model/DirectReturnAddress.js';
import type { DispatchDirectOptions } from '../model/DispatchDirectOptions.js';
import { FieldReader } from './FieldReader.js';
import type { FieldValues } from './FieldValues.js';
import type { RecordBuildContext } from './RecordBuildContext.js';
import type { RecordBuildResult } from './RecordBuildResult.js';
import { readDocuments, readPhysicalAddress, readPreset } from './recordReaders.js';

const SENDER_TAX_ID = /^\d{1,11}$/;
const PRODUCT_CODE = /^[A-Z0-9_]{1,20}$/;
const SHA256_BASE64 = /^[A-Za-z0-9+/]{43}=$/;
const DEFAULT_PRINT_TYPE = 'BN_FRONTE_RETRO';

/**
 * Builds and validates the record of a row for the `direct` mode (§7.2,
 * §9.2). Pure; collects all the issues of the row.
 *
 * Requires sender (`requestPaId`, `senderName`), recipient, address (ZIP and
 * province for Italian addresses), a consolidator product code, the `ATTO`
 * (pratica or reference already in SafeStorage) and the `AAR` reference.
 *
 * @param rowIndex - Position in the input
 * @param rowKey - Row key
 * @param values - Merged field values of the row
 * @param context - Run-level facts (`mode: 'direct'`)
 * @param requestId - `requestId` rendered from the template
 * @returns The record, or the issues
 */
export function buildDirectRecord(
  rowIndex: number,
  rowKey: string,
  values: FieldValues,
  context: RecordBuildContext,
  requestId: string,
): RecordBuildResult {
  const reader = new FieldReader(values);
  const senderTaxId = reader.matching('sender.taxId', SENDER_TAX_ID, 'up to 11 digits', true);
  const senderDenomination = reader.required('sender.denomination', 1024);
  const recipientTaxId = reader.required('recipient.taxId', 32);
  const recipientDenomination = reader.required('recipient.denomination', 1024);
  const physicalAddress = readPhysicalAddress(reader, true);
  const product = reader.matching('product', PRODUCT_CODE, 'a consolidator product code (AR, 890, RS…)', true);
  const documents = readDocuments(reader, context);
  const preset = readPreset(reader);
  const direct = readDirectOptions(reader, requestId);

  if (reader.issues.length > 0 || direct === undefined) return { ok: false, issues: reader.issues };
  return {
    ok: true,
    record: {
      rowIndex,
      rowKey,
      subject: '',
      sender: { taxId: senderTaxId ?? '', denomination: senderDenomination ?? '' }, // Safe: required, no issues
      recipient: { type: 'PF', taxId: recipientTaxId ?? '', denomination: recipientDenomination ?? '' },
      physicalAddress: physicalAddress ?? { address: '', municipality: '' },
      product: product ?? '',
      documents: documents ?? { kind: 'shared' },
      options: { taxonomyCode: '', notificationFeePolicy: 'FLAT_RATE', pagoPaIntMode: 'NONE' },
      ...(preset !== undefined && { preset }),
      direct,
    },
  };
}

function readDirectOptions(reader: FieldReader, requestId: string): DispatchDirectOptions | undefined {
  const aarKey = reader.required('direct.aar.key', 512);
  const aarSha256 = reader.matching('direct.aar.sha256', SHA256_BASE64, 'Base64 SHA-256 of 44 characters', true);
  const printType = reader.optional('direct.printType', 64) ?? DEFAULT_PRINT_TYPE;
  const address = reader.optional('direct.sender.address', 1024);
  const city = reader.optional('direct.sender.city', 256);
  const province = reader.optional('direct.sender.province', 256);
  const digitalAddress = reader.optional('direct.sender.digitalAddress', 320);
  const returnAddress = readReturnAddress(reader);
  if (aarKey === undefined || aarSha256 === undefined) return undefined;
  return {
    requestId,
    printType,
    aar: { key: aarKey, sha256: aarSha256 },
    sender: {
      ...(address !== undefined && { address }),
      ...(city !== undefined && { city }),
      ...(province !== undefined && { province }),
      ...(digitalAddress !== undefined && { digitalAddress }),
    },
    ...(returnAddress !== undefined && { returnAddress }),
  };
}

/** The return address is optional, but when present it must be complete. */
function readReturnAddress(reader: FieldReader): DirectReturnAddress | undefined {
  const fields = [
    'direct.returnAddress.name',
    'direct.returnAddress.address',
    'direct.returnAddress.zip',
    'direct.returnAddress.city',
  ] as const;
  if (fields.every((field) => reader.value(field) === undefined)) return undefined;
  const [name, address, zip, city] = fields.map((field) => reader.required(field, 1024));
  if (name === undefined || address === undefined || zip === undefined || city === undefined) return undefined;
  return { name, address, zip, city };
}
