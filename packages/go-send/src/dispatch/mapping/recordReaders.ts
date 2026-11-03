import * as path from 'node:path';

import type { DispatchDigitalDomicile } from '../model/DispatchDigitalDomicile.js';
import type { DispatchPhysicalAddress } from '../model/DispatchPhysicalAddress.js';
import type { DocumentSource } from '../model/DocumentSource.js';
import type { PresetIds } from '../model/PresetIds.js';
import type { FieldReader } from './FieldReader.js';
import type { RecordBuildContext } from './RecordBuildContext.js';

const ITALIAN_ZIP = /^\d{5}$/;
const SHA256_BASE64 = /^[A-Za-z0-9+/]{43}=$/;

/**
 * Reads the physical address of the recipient. The ZIP code must be Italian
 * when there is no foreign state; `requireProvince` (direct mode) also
 * requires the province for Italian addresses.
 *
 * @param reader - Field reader of the row
 * @param requireProvince - Province mandatory for Italian addresses
 * @returns The address, or `undefined` when required fields are missing
 */
export function readPhysicalAddress(
  reader: FieldReader,
  requireProvince: boolean,
): DispatchPhysicalAddress | undefined {
  const address = reader.required('physicalAddress.address', 1024);
  const municipality = reader.required('physicalAddress.municipality', 256);
  const foreignState = reader.optional('physicalAddress.foreignState', 256);
  const zip =
    foreignState === undefined
      ? reader.matching('physicalAddress.zip', ITALIAN_ZIP, 'an Italian ZIP code of 5 digits', true)
      : reader.optional('physicalAddress.zip', 15);
  const at = reader.optional('physicalAddress.at', 44);
  const addressDetails = reader.optional('physicalAddress.addressDetails', 1024);
  const municipalityDetails = reader.optional('physicalAddress.municipalityDetails', 256);
  const province =
    requireProvince && foreignState === undefined
      ? reader.required('physicalAddress.province', 256)
      : reader.optional('physicalAddress.province', 256);
  if (address === undefined || municipality === undefined) return undefined;
  return {
    address,
    municipality,
    ...(at !== undefined && { at }),
    ...(addressDetails !== undefined && { addressDetails }),
    ...(zip !== undefined && { zip }),
    ...(municipalityDetails !== undefined && { municipalityDetails }),
    ...(province !== undefined && { province }),
    ...(foreignState !== undefined && { foreignState }),
  };
}

/**
 * Reads the digital domicile; only `PEC` is accepted.
 *
 * @param reader - Field reader of the row
 * @returns The domicile, if the row has an address
 */
export function readDigitalDomicile(reader: FieldReader): DispatchDigitalDomicile | undefined {
  const address = reader.optional('digitalDomicile.address', 320);
  const type = reader.value('digitalDomicile.type');
  if (address === undefined) return undefined;
  if (type !== undefined && type !== 'PEC') {
    reader.issue('INVALID_ENUM', 'digitalDomicile.type', `digitalDomicile.type "${type}" is not supported: only PEC`);
  }
  return { type: 'PEC', address };
}

/**
 * Resolves the document source of a row, in precedence order (§8.1.1). In
 * `direct` mode documents must already be in SafeStorage: local files and
 * the shared document (upload) are not available, and `versionToken` is not
 * needed.
 *
 * @param reader - Field reader of the row
 * @param context - Run-level facts
 * @returns The source, or `undefined` with issues recorded
 */
export function readDocuments(reader: FieldReader, context: RecordBuildContext): DocumentSource | undefined {
  const direct = context.mode === 'direct';
  const pratica = reader.value('documents.pratica');
  if (pratica !== undefined) {
    if (context.knownPratiche === undefined) {
      reader.issue('NO_ATTACHMENTS_FILE', 'documents.pratica', `pratica "${pratica}" requires --attachments-file`);
    } else if (!context.knownPratiche.has(pratica)) {
      reader.issue('UNKNOWN_PRATICA', 'documents.pratica', `pratica "${pratica}" is not in the attachments file`);
    }
    return { kind: 'pratica', pratica };
  }

  const files = splitList(reader.value('documents.files'));
  if (files.length > 0 && direct) {
    reader.issue('UNSUPPORTED_IN_DIRECT', 'documents.files', 'direct mode needs documents already in SafeStorage');
    return undefined;
  }
  if (files.length > 0) {
    const titles = splitList(reader.value('documents.titles'));
    return {
      kind: 'rowFiles',
      files: files.map((file, index) => ({
        path: path.resolve(context.documentsDir, file),
        title: titles[index] ?? path.basename(file, path.extname(file)),
      })),
    };
  }

  const key = reader.value('documents.reference.key');
  const versionToken = reader.value('documents.reference.versionToken');
  const sha256 = reader.value('documents.reference.sha256');
  if (key !== undefined || versionToken !== undefined || sha256 !== undefined) {
    reader.required('documents.reference.key', 512);
    if (!direct) reader.required('documents.reference.versionToken', 256);
    reader.matching('documents.reference.sha256', SHA256_BASE64, 'Base64 SHA-256 of 44 characters', true);
    if (key === undefined || sha256 === undefined || (versionToken === undefined && !direct)) return undefined;
    const title = reader.optional('documents.reference.title', 512) ?? 'Documento';
    return {
      kind: 'reference',
      refs: [{ key, versionToken: versionToken ?? '', sha256, contentType: 'application/pdf', title }],
    };
  }

  if (context.sharedDocumentAvailable && !direct) return { kind: 'shared' };
  reader.issue(
    'NO_DOCUMENTS',
    undefined,
    'no document: set a pratica, document files, a reference or a shared document',
  );
  return undefined;
}

/**
 * Reads the identifiers already present in the input, if any.
 *
 * @param reader - Field reader of the row
 * @returns The identifiers, if any
 */
export function readPreset(reader: FieldReader): PresetIds | undefined {
  const iun = reader.value('preset.iun');
  const notificationRequestId = reader.value('preset.notificationRequestId');
  if (iun === undefined && notificationRequestId === undefined) return undefined;
  return {
    ...(iun !== undefined && { iun }),
    ...(notificationRequestId !== undefined && { notificationRequestId }),
  };
}

/**
 * Splits a `|`-separated list, trimming and dropping empty items.
 *
 * @param value - Raw value
 * @returns Items
 */
function splitList(value: string | undefined): ReadonlyArray<string> {
  if (value === undefined) return [];
  return value
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}
