import type { DirectReturnAddress } from '../model/DirectReturnAddress.js';
import type { DispatchDirectOptions } from '../model/DispatchDirectOptions.js';
import type { CanonicalField } from './CanonicalField.js';
import { PRODUCT_CODE, SHA256_BASE64 } from './fieldPatterns.js';
import { FieldReader } from './FieldReader.js';
import type { FieldValues } from './FieldValues.js';
import type { RecordBuildContext } from './RecordBuildContext.js';
import type { RecordBuildResult } from './RecordBuildResult.js';
import { readDocuments, readPhysicalAddress, readPresetIds, readRecipient, readSender } from './recordReaders.js';

const DEFAULT_PRINT_TYPE = 'BN_FRONTE_RETRO';
const RETURN_ADDRESS_FIELDS = [
  'direct.returnAddress.name',
  'direct.returnAddress.address',
  'direct.returnAddress.zip',
  'direct.returnAddress.city',
] as const satisfies ReadonlyArray<CanonicalField>;

/** pn-ec has no recipient type: the record carries `PF` unless the row says otherwise. */
const DIRECT_DEFAULTS: ReadonlyMap<CanonicalField, string> = new Map<CanonicalField, string>([
  ['recipient.type', 'PF'],
]);

/**
 * Builds and validates the record of a row for the `direct` mode (§7.2,
 * §9.2). Pure; collects all the issues of the row.
 *
 * Requires sender (`requestPaId`, `senderName`), recipient, address (ZIP and
 * province for Italian addresses), a consolidator product code, the `ATTO`
 * (pratica or reference already in SafeStorage) and the `AAR` reference. An
 * optional `preset.iun` (or `preset.notificationRequestId`) must be a valid
 * IUN: it goes into the pn-ec request.
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
  const reader = new FieldReader(values, DIRECT_DEFAULTS);
  const sender = readSender(reader, context);
  const recipient = readRecipient(reader);
  const physicalAddress = readPhysicalAddress(reader, true);
  const product = reader.matching('product', PRODUCT_CODE, 'a consolidator product code (AR, 890, RS…)', true);
  const documents = readDocuments(reader, context);
  const preset = readPresetIds(reader, false);
  const direct = readDirectOptions(reader, requestId);

  if (
    reader.hasIssues() ||
    sender === undefined ||
    recipient === undefined ||
    physicalAddress === undefined ||
    product === undefined ||
    documents === undefined ||
    direct === undefined
  ) {
    return reader.failure();
  }
  return {
    ok: true,
    record: {
      rowIndex,
      rowKey,
      subject: '', // Not used by pn-ec
      sender,
      recipient,
      physicalAddress,
      product,
      documents,
      // Not used by pn-ec; neutral values keep the record shape of e2e.
      options: { taxonomyCode: '', notificationFeePolicy: 'FLAT_RATE', pagoPaIntMode: 'NONE' },
      ...(preset !== undefined && { preset }),
      direct,
    },
  };
}

/** Required: the AAR reference plus optional sender and return address details. */
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

/**
 * The return address is optional, but when present it must be complete:
 * a partial one records an issue for each missing field.
 */
function readReturnAddress(reader: FieldReader): DirectReturnAddress | undefined {
  if (RETURN_ADDRESS_FIELDS.every((field) => reader.value(field) === undefined)) return undefined;
  const [name, address, zip, city] = RETURN_ADDRESS_FIELDS.map((field) => reader.required(field, 1024));
  if (name === undefined || address === undefined || zip === undefined || city === undefined) return undefined;
  return { name, address, zip, city };
}
