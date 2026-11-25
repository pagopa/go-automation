/**
 * Readers of the record parts shared by the builders (`buildRecord`,
 * `buildDirectRecord`, `buildPreset`).
 *
 * Contract: a reader returns `undefined` for a **required** part only after
 * recording at least one issue on the {@link FieldReader}; for an optional
 * part, `undefined` without issues means "absent". Builders can then return
 * `reader.failure()` without placeholder values.
 */

import * as path from 'node:path';

import { decodeIun, encodeNotificationRequestId, isIun } from '../ids/identifiers.js';
import type { DispatchDigitalDomicile } from '../model/DispatchDigitalDomicile.js';
import type { DispatchPhysicalAddress } from '../model/DispatchPhysicalAddress.js';
import type { DispatchRecipient } from '../model/DispatchRecipient.js';
import type { DispatchSender } from '../model/DispatchSender.js';
import type { DocumentSource } from '../model/DocumentSource.js';
import type { LocalDocument } from '../model/LocalDocument.js';
import type { RecipientType } from '../model/RecipientType.js';
import {
  ITALIAN_ZIP,
  NOTIFICATION_REQUEST_ID,
  RECIPIENT_TAX_ID,
  SENDER_TAX_ID,
  SHA256_BASE64,
} from './fieldPatterns.js';
import type { FieldReader } from './FieldReader.js';
import type { RecordBuildContext } from './RecordBuildContext.js';
import type { ResolvedPresetIds } from './ResolvedPresetIds.js';

const RECIPIENT_TYPES: ReadonlySet<RecipientType> = new Set<RecipientType>(['PF', 'PG']);
/** Digital domicile types SEND accepts on a notification request. */
const DIGITAL_DOMICILE_TYPES: ReadonlySet<'PEC'> = new Set<'PEC'>(['PEC']);
const MAX_DENOMINATION_LENGTH = 1024;
const DEFAULT_REFERENCE_TITLE = 'Documento';

/**
 * Reads the sender (required). In `e2e`, a `sender.taxId` different from the
 * environment one is an issue: SEND would reject it with 403 (§7.4.2).
 *
 * @param reader - Field reader of the row
 * @param context - Run-level facts
 * @returns The sender, or `undefined` with issues recorded
 */
export function readSender(reader: FieldReader, context: RecordBuildContext): DispatchSender | undefined {
  const taxId = reader.matching('sender.taxId', SENDER_TAX_ID, 'up to 11 digits', true);
  const denomination = reader.required('sender.denomination', MAX_DENOMINATION_LENGTH);
  if (taxId !== undefined && context.environmentSenderTaxId !== undefined && taxId !== context.environmentSenderTaxId) {
    reader.issue(
      'SENDER_MISMATCH',
      'sender.taxId',
      `sender.taxId ${taxId} differs from the environment (${context.environmentSenderTaxId}): SEND would reject it with 403`,
    );
    return undefined;
  }
  if (taxId === undefined || denomination === undefined) return undefined;
  return { taxId, denomination };
}

/**
 * Reads the recipient (required). `recipient.taxId` is upper-cased and must
 * be a codice fiscale or an 11-digit partita IVA; `recipient.type` must be
 * `PF` or `PG` (give the reader a neutral default when the mode has none).
 *
 * @param reader - Field reader of the row
 * @returns The recipient, or `undefined` with issues recorded
 */
export function readRecipient(reader: FieldReader): DispatchRecipient | undefined {
  const type = reader.oneOf('recipient.type', RECIPIENT_TYPES, true);
  const taxId = reader.matchingUpperCase(
    'recipient.taxId',
    RECIPIENT_TAX_ID,
    'a codice fiscale (16 characters) or a partita IVA (11 digits)',
    true,
  );
  const denomination = reader.required('recipient.denomination', MAX_DENOMINATION_LENGTH);
  if (type === undefined || taxId === undefined || denomination === undefined) return undefined;
  return { type, taxId, denomination };
}

/**
 * Reads the physical address of the recipient (required). The ZIP code must
 * be Italian (5 digits) when there is no foreign state; a foreign ZIP code is
 * not checked at all (any format or length goes to SEND as is).
 * `requireProvince` (direct mode) also requires the province for Italian
 * addresses.
 *
 * @param reader - Field reader of the row
 * @param requireProvince - Province mandatory for Italian addresses
 * @returns The address, or `undefined` with issues recorded
 */
export function readPhysicalAddress(
  reader: FieldReader,
  requireProvince: boolean,
): DispatchPhysicalAddress | undefined {
  const address = reader.required('physicalAddress.address', 1024);
  const municipality = reader.required('physicalAddress.municipality', 256);
  const foreignState = reader.optional('physicalAddress.foreignState', 256);
  // Only the Italian ZIP is validated; a foreign one is sent as is: SEND is the one judging it.
  const zip =
    foreignState === undefined
      ? reader.matching('physicalAddress.zip', ITALIAN_ZIP, 'an Italian ZIP code of 5 digits', true)
      : reader.value('physicalAddress.zip');
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
 * Reads the digital domicile (optional); only `PEC` is accepted, in any case
 * (`pec`, `Pec`), like the other enumerated fields.
 *
 * @param reader - Field reader of the row
 * @returns The domicile, or `undefined` when the row has no digital address
 */
export function readDigitalDomicile(reader: FieldReader): DispatchDigitalDomicile | undefined {
  const address = reader.optional('digitalDomicile.address', 320);
  if (address === undefined) return undefined;
  reader.oneOf('digitalDomicile.type', DIGITAL_DOMICILE_TYPES, false);
  return { type: 'PEC', address };
}

/**
 * Resolves the document source of a row (required), in precedence order
 * (§8.1.1). In `direct` mode documents must already be in SafeStorage: local
 * files and the shared document (upload) are not available, and
 * `versionToken` is not needed.
 *
 * Files of `documents.files` and titles of `documents.titles` are paired by
 * position (`|`-separated): an empty title falls back to the file name, an
 * empty file entry is skipped with its title. Files must resolve inside
 * `documentsDir`, so an input file cannot attach arbitrary local files.
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

  const files = splitPositional(reader.value('documents.files'));
  if (files.some((file) => file !== '')) {
    if (direct) {
      reader.issue('UNSUPPORTED_IN_DIRECT', 'documents.files', 'direct mode needs documents already in SafeStorage');
      return undefined;
    }
    return readRowFiles(reader, files, context.documentsDir);
  }

  const key = reader.value('documents.reference.key');
  const versionToken = reader.value('documents.reference.versionToken');
  const sha256 = reader.value('documents.reference.sha256');
  if (key !== undefined || versionToken !== undefined || sha256 !== undefined) {
    return readReference(reader, direct);
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
 * Reads the identifiers of a notification already sent: `preset.iun` and/or
 * `preset.notificationRequestId` (RF-12). The missing one is derived (the
 * `notificationRequestId` is the Base64 of the IUN, A1); when both are
 * present they must agree.
 *
 * @param reader - Field reader of the row
 * @param isRequired - Whether at least one of the two is required
 * @returns The identifiers; `undefined` when absent (if optional), or with issues recorded
 */
export function readPresetIds(reader: FieldReader, isRequired: boolean): ResolvedPresetIds | undefined {
  const iun = reader.value('preset.iun');
  const requestId = reader.value('preset.notificationRequestId');
  if (iun === undefined && requestId === undefined) {
    if (isRequired) {
      reader.issue('MISSING_FIELD', 'preset.iun', 'preset.iun or preset.notificationRequestId is required');
    }
    return undefined;
  }

  const validIun = iun === undefined || isIun(iun) ? iun : undefined;
  if (iun !== undefined && validIun === undefined) {
    reader.issue('INVALID_FORMAT', 'preset.iun', `"${iun}" is not an IUN`);
  }
  const decodedIun = requestId === undefined ? undefined : decodeRequestId(reader, requestId);
  const invalid =
    (iun !== undefined && validIun === undefined) || (requestId !== undefined && decodedIun === undefined);
  if (invalid) return undefined;
  if (validIun !== undefined && decodedIun !== undefined && validIun !== decodedIun) {
    reader.issue(
      'PRESET_MISMATCH',
      'preset.notificationRequestId',
      `preset.notificationRequestId "${requestId ?? ''}" encodes ${decodedIun}, not preset.iun ${validIun}`,
    );
    return undefined;
  }

  // Defined here: at least one identifier is present, and every present one is valid.
  const resolvedIun = validIun ?? decodedIun;
  if (resolvedIun === undefined) return undefined;
  return { iun: resolvedIun, notificationRequestId: requestId ?? encodeNotificationRequestId(resolvedIun) };
}

function decodeRequestId(reader: FieldReader, requestId: string): string | undefined {
  const decoded = NOTIFICATION_REQUEST_ID.test(requestId) ? decodeIun(requestId) : undefined;
  if (decoded === undefined) {
    reader.issue(
      'INVALID_FORMAT',
      'preset.notificationRequestId',
      `"${requestId}" is not a notificationRequestId (Base64 of an IUN)`,
    );
  }
  return decoded;
}

function readRowFiles(
  reader: FieldReader,
  files: ReadonlyArray<string>,
  documentsDir: string,
): DocumentSource | undefined {
  const baseDir = path.resolve(documentsDir);
  const titles = splitPositional(reader.value('documents.titles'));
  const documents: LocalDocument[] = [];
  let escaped = false;
  for (const [index, file] of files.entries()) {
    if (file === '') continue;
    const resolved = path.resolve(baseDir, file);
    if (!isInside(baseDir, resolved)) {
      reader.issue('DOCUMENT_OUTSIDE_DIR', 'documents.files', `"${file}" is outside the documents directory`);
      escaped = true;
      continue;
    }
    const title = titles[index] ?? '';
    documents.push({ path: resolved, title: title === '' ? path.basename(file, path.extname(file)) : title });
  }
  return escaped ? undefined : { kind: 'rowFiles', files: documents };
}

function readReference(reader: FieldReader, direct: boolean): DocumentSource | undefined {
  const key = reader.required('documents.reference.key', 512);
  const versionToken = direct
    ? reader.optional('documents.reference.versionToken', 256)
    : reader.required('documents.reference.versionToken', 256);
  const sha256 = reader.matching('documents.reference.sha256', SHA256_BASE64, 'Base64 SHA-256 of 44 characters', true);
  const title = reader.optional('documents.reference.title', 512);
  if (key === undefined || sha256 === undefined || (versionToken === undefined && !direct)) return undefined;
  return {
    kind: 'reference',
    refs: [
      {
        key,
        versionToken: versionToken ?? '', // Not used in direct mode (pn-ec takes key and sha256)
        sha256,
        contentType: 'application/pdf',
        title: title ?? DEFAULT_REFERENCE_TITLE,
      },
    ],
  };
}

/**
 * Splits a `|`-separated list keeping positions: items are trimmed, empty
 * items are kept (as `''`) so that two parallel lists stay aligned.
 */
function splitPositional(value: string | undefined): ReadonlyArray<string> {
  return value === undefined ? [] : value.split('|').map((item) => item.trim());
}

/** Whether `target` is strictly inside `baseDir` (both absolute and resolved). */
function isInside(baseDir: string, target: string): boolean {
  const relative = path.relative(baseDir, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
