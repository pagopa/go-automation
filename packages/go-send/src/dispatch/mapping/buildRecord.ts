import * as path from 'node:path';

import type { DispatchDigitalDomicile } from '../model/DispatchDigitalDomicile.js';
import type { DispatchNotificationOptions } from '../model/DispatchNotificationOptions.js';
import type { DispatchPayment } from '../model/DispatchPayment.js';
import type { DispatchPhysicalAddress } from '../model/DispatchPhysicalAddress.js';
import type { DocumentSource } from '../model/DocumentSource.js';
import type { NotificationFeePolicy } from '../model/NotificationFeePolicy.js';
import type { PagoPaIntMode } from '../model/PagoPaIntMode.js';
import type { PresetIds } from '../model/PresetIds.js';
import type { RecipientType } from '../model/RecipientType.js';
import type { CanonicalField } from './CanonicalField.js';
import type { FieldValues } from './FieldValues.js';
import type { RecordBuildContext } from './RecordBuildContext.js';
import type { RecordBuildResult } from './RecordBuildResult.js';
import type { ValidationIssue } from './ValidationIssue.js';

// Limits and formats of NewNotificationRequestV26 (pn-delivery OpenAPI).
const SENDER_TAX_ID = /^\d{1,11}$/;
const TAXONOMY_CODE = /^\d{6}[A-Z]$/;
const ITALIAN_ZIP = /^\d{5}$/;
const SHA256_BASE64 = /^[A-Za-z0-9+/]{43}=$/;
const DATE = /^\d{4}-(1[0-2]|0[1-9])-(3[01]|[12]\d|0[1-9])$/;
const NOTICE_CODE = /^\d{18}$/;
const CREDITOR_TAX_ID = /^\d{11}$/;
const NON_NEGATIVE_INTEGER = /^\d+$/;

const PRODUCTS: ReadonlyMap<string, string> = new Map([
  ['AR', 'AR'],
  ['AR_REGISTERED_LETTER', 'AR'],
  ['890', '890'],
  ['REGISTERED_LETTER_890', '890'],
]);
const RECIPIENT_TYPES: ReadonlySet<string> = new Set<RecipientType>(['PF', 'PG']);
const FEE_POLICIES: ReadonlySet<string> = new Set<NotificationFeePolicy>(['FLAT_RATE', 'DELIVERY_MODE']);
const INT_MODES: ReadonlySet<string> = new Set<PagoPaIntMode>(['NONE', 'SYNC', 'ASYNC']);

/** Neutral defaults of the API (§7.4.2), plus the defaults of the former QA adapter. */
const NEUTRAL_DEFAULTS: ReadonlyMap<CanonicalField, string> = new Map<CanonicalField, string>([
  ['recipient.type', 'PF'],
  ['product', 'AR'],
  ['notificationOptions.taxonomyCode', '010202N'],
  ['notificationOptions.notificationFeePolicy', 'FLAT_RATE'],
  ['notificationOptions.pagoPaIntMode', 'NONE'],
]);

/**
 * Builds and validates the canonical record of a row for the `e2e` mode
 * (§7.2). Pure: collects **all** issues instead of stopping at the first.
 *
 * Document files are only resolved here (absolute path, title); their
 * content is checked by `LocalDocumentInspector`.
 *
 * @param rowIndex - Position in the input, 0-based
 * @param rowKey - Stable row key
 * @param values - Merged field values (row > CLI > environment)
 * @param context - Run-level facts
 * @returns The record, or the issues that make the row invalid
 */
export function buildRecord(
  rowIndex: number,
  rowKey: string,
  values: FieldValues,
  context: RecordBuildContext,
): RecordBuildResult {
  const reader = new FieldReader(values);

  const subject = reader.required('subject', 134);
  const abstract = reader.optional('abstract', 1024);
  const senderTaxId = reader.matching('sender.taxId', SENDER_TAX_ID, 'up to 11 digits', true);
  const senderDenomination = reader.required('sender.denomination', 1024);
  if (
    senderTaxId !== undefined &&
    context.environmentSenderTaxId !== undefined &&
    senderTaxId !== context.environmentSenderTaxId
  ) {
    reader.issue(
      'SENDER_MISMATCH',
      'sender.taxId',
      `sender.taxId ${senderTaxId} differs from the environment (${context.environmentSenderTaxId}): SEND would reject it with 403`,
    );
  }

  const recipientType = reader.oneOf('recipient.type', RECIPIENT_TYPES) as RecipientType | undefined;
  const recipientTaxId = reader.required('recipient.taxId', 32);
  const recipientDenomination = reader.required('recipient.denomination', 1024);
  const physicalAddress = readPhysicalAddress(reader);
  const digitalDomicile = readDigitalDomicile(reader);
  const product = readProduct(reader);
  const payment = readPayment(reader);
  const options = readOptions(reader);
  const documents = readDocuments(reader, context);
  const preset = readPreset(reader);

  if (reader.issues.length > 0) return { ok: false, issues: reader.issues };
  return {
    ok: true,
    record: {
      rowIndex,
      rowKey,
      subject: subject ?? '', // Safe: required, no issues
      ...(abstract !== undefined && { abstract }),
      sender: { taxId: senderTaxId ?? '', denomination: senderDenomination ?? '' },
      recipient: {
        type: recipientType ?? 'PF',
        taxId: recipientTaxId ?? '',
        denomination: recipientDenomination ?? '',
      },
      physicalAddress: physicalAddress ?? { address: '', municipality: '' },
      ...(digitalDomicile !== undefined && { digitalDomicile }),
      product: product ?? 'AR',
      documents: documents ?? { kind: 'shared' },
      ...(payment !== undefined && { payment }),
      options: options ?? { taxonomyCode: '', notificationFeePolicy: 'FLAT_RATE', pagoPaIntMode: 'NONE' },
      ...(preset !== undefined && { preset }),
    },
  };
}

function readPhysicalAddress(reader: FieldReader): DispatchPhysicalAddress | undefined {
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
  const province = reader.optional('physicalAddress.province', 256);
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

function readDigitalDomicile(reader: FieldReader): DispatchDigitalDomicile | undefined {
  const address = reader.optional('digitalDomicile.address', 320);
  const type = reader.value('digitalDomicile.type');
  if (address === undefined) return undefined;
  if (type !== undefined && type !== 'PEC') {
    reader.issue('INVALID_ENUM', 'digitalDomicile.type', `digitalDomicile.type "${type}" is not supported: only PEC`);
  }
  return { type: 'PEC', address };
}

function readProduct(reader: FieldReader): string | undefined {
  const raw = reader.valueOrDefault('product');
  const product = raw === undefined ? undefined : PRODUCTS.get(raw.toUpperCase());
  if (raw !== undefined && product === undefined) {
    reader.issue('UNSUPPORTED_PRODUCT', 'product', `product "${raw}" is not supported in e2e mode (AR, 890)`);
  }
  return product;
}

function readPayment(reader: FieldReader): DispatchPayment | undefined {
  const noticeCode = reader.value('payment.noticeCode');
  const creditorTaxId = reader.value('payment.creditorTaxId');
  if (noticeCode === undefined && creditorTaxId === undefined) return undefined;
  const checkedNotice = reader.matching('payment.noticeCode', NOTICE_CODE, '18 digits', true);
  const checkedCreditor = reader.matching('payment.creditorTaxId', CREDITOR_TAX_ID, '11 digits', true);
  const applyCostRaw = reader.value('payment.applyCost')?.toLowerCase();
  if (applyCostRaw !== undefined && applyCostRaw !== 'true' && applyCostRaw !== 'false') {
    reader.issue('INVALID_FORMAT', 'payment.applyCost', 'payment.applyCost must be true or false');
  }
  if (checkedNotice === undefined || checkedCreditor === undefined) return undefined;
  return { noticeCode: checkedNotice, creditorTaxId: checkedCreditor, applyCost: applyCostRaw === 'true' };
}

function readOptions(reader: FieldReader): DispatchNotificationOptions | undefined {
  const group = reader.optional('notificationOptions.group', 1024);
  const taxonomyCode = reader.matching(
    'notificationOptions.taxonomyCode',
    TAXONOMY_CODE,
    '6 digits and a letter',
    true,
  );
  const feePolicy = reader.oneOf('notificationOptions.notificationFeePolicy', FEE_POLICIES) as
    NotificationFeePolicy | undefined;
  const intMode = reader.oneOf('notificationOptions.pagoPaIntMode', INT_MODES) as PagoPaIntMode | undefined;
  const paFee = reader.integer('notificationOptions.paFee');
  const vat = reader.integer('notificationOptions.vat');
  const paProtocolNumber = reader.optional('notificationOptions.paProtocolNumber', 256);
  const expiration = reader.matching('notificationOptions.paymentExpirationDate', DATE, 'YYYY-MM-DD', false);
  if (taxonomyCode === undefined || feePolicy === undefined || intMode === undefined) return undefined;
  return {
    taxonomyCode,
    notificationFeePolicy: feePolicy,
    pagoPaIntMode: intMode,
    ...(group !== undefined && { group }),
    ...(paFee !== undefined && { paFee }),
    ...(vat !== undefined && { vat }),
    ...(paProtocolNumber !== undefined && { paProtocolNumber }),
    ...(expiration !== undefined && { paymentExpirationDate: expiration }),
  };
}

function readDocuments(reader: FieldReader, context: RecordBuildContext): DocumentSource | undefined {
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
    reader.required('documents.reference.versionToken', 256);
    reader.matching('documents.reference.sha256', SHA256_BASE64, 'Base64 SHA-256 of 44 characters', true);
    if (key === undefined || versionToken === undefined || sha256 === undefined) return undefined;
    const title = reader.optional('documents.reference.title', 512) ?? 'Documento';
    return { kind: 'reference', refs: [{ key, versionToken, sha256, contentType: 'application/pdf', title }] };
  }

  if (context.sharedDocumentAvailable) return { kind: 'shared' };
  reader.issue(
    'NO_DOCUMENTS',
    undefined,
    'no document: set a pratica, document files, a reference or a shared document',
  );
  return undefined;
}

function readPreset(reader: FieldReader): PresetIds | undefined {
  const iun = reader.value('preset.iun');
  const notificationRequestId = reader.value('preset.notificationRequestId');
  if (iun === undefined && notificationRequestId === undefined) return undefined;
  return {
    ...(iun !== undefined && { iun }),
    ...(notificationRequestId !== undefined && { notificationRequestId }),
  };
}

function splitList(value: string | undefined): ReadonlyArray<string> {
  if (value === undefined) return [];
  return value
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/** Reads field values and accumulates validation issues. */
class FieldReader {
  public readonly issues: ValidationIssue[] = [];

  constructor(private readonly values: FieldValues) {}

  public value(field: CanonicalField): string | undefined {
    return this.values.get(field);
  }

  public valueOrDefault(field: CanonicalField): string | undefined {
    return this.values.get(field) ?? NEUTRAL_DEFAULTS.get(field);
  }

  public issue(code: string, field: CanonicalField | undefined, message: string): void {
    this.issues.push({ code, message, ...(field !== undefined && { field }) });
  }

  public required(field: CanonicalField, maxLength: number): string | undefined {
    const value = this.valueOrDefault(field);
    if (value === undefined) {
      this.issue('MISSING_FIELD', field, `${field} is required`);
      return undefined;
    }
    return this.checkLength(field, value, maxLength);
  }

  public optional(field: CanonicalField, maxLength: number): string | undefined {
    const value = this.values.get(field);
    return value === undefined ? undefined : this.checkLength(field, value, maxLength);
  }

  public matching(field: CanonicalField, pattern: RegExp, expected: string, isRequired: boolean): string | undefined {
    const value = this.valueOrDefault(field);
    if (value === undefined) {
      if (isRequired) this.issue('MISSING_FIELD', field, `${field} is required`);
      return undefined;
    }
    if (!pattern.test(value)) {
      this.issue('INVALID_FORMAT', field, `${field} "${value}" must be ${expected}`);
      return undefined;
    }
    return value;
  }

  public oneOf(field: CanonicalField, allowed: ReadonlySet<string>): string | undefined {
    const value = this.valueOrDefault(field)?.toUpperCase();
    if (value === undefined || allowed.has(value)) return value;
    this.issue('INVALID_ENUM', field, `${field} "${value}" must be one of ${[...allowed].join(', ')}`);
    return undefined;
  }

  public integer(field: CanonicalField): number | undefined {
    const value = this.values.get(field);
    if (value === undefined) return undefined;
    if (!NON_NEGATIVE_INTEGER.test(value)) {
      this.issue('INVALID_FORMAT', field, `${field} "${value}" must be a non-negative integer (euro cents)`);
      return undefined;
    }
    return Number(value);
  }

  private checkLength(field: CanonicalField, value: string, maxLength: number): string | undefined {
    if (value.length <= maxLength) return value;
    this.issue('TOO_LONG', field, `${field} exceeds ${maxLength} characters (${value.length})`);
    return undefined;
  }
}
