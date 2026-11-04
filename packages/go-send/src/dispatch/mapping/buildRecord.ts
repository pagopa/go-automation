import type { DispatchNotificationOptions } from '../model/DispatchNotificationOptions.js';
import type { DispatchPayment } from '../model/DispatchPayment.js';
import type { NotificationFeePolicy } from '../model/NotificationFeePolicy.js';
import type { PagoPaIntMode } from '../model/PagoPaIntMode.js';
import type { CanonicalField } from './CanonicalField.js';
import { CREDITOR_TAX_ID, ISO_DATE, NOTICE_CODE, TAXONOMY_CODE } from './fieldPatterns.js';
import { FieldReader } from './FieldReader.js';
import type { FieldValues } from './FieldValues.js';
import type { RecordBuildContext } from './RecordBuildContext.js';
import type { RecordBuildResult } from './RecordBuildResult.js';
import { readDigitalDomicile, readDocuments, readPhysicalAddress, readRecipient, readSender } from './recordReaders.js';

/**
 * Products accepted in `e2e` mode, by any of their names (case-insensitive),
 * mapped to the canonical `AR` / `890`. The only place where the API product
 * names (`AR_REGISTERED_LETTER`, `REGISTERED_LETTER_890`) are translated.
 */
const E2E_PRODUCTS: ReadonlyMap<string, string> = new Map([
  ['AR', 'AR'],
  ['AR_REGISTERED_LETTER', 'AR'],
  ['890', '890'],
  ['REGISTERED_LETTER_890', '890'],
]);
const FEE_POLICIES: ReadonlySet<NotificationFeePolicy> = new Set<NotificationFeePolicy>(['FLAT_RATE', 'DELIVERY_MODE']);
const INT_MODES: ReadonlySet<PagoPaIntMode> = new Set<PagoPaIntMode>(['NONE', 'SYNC', 'ASYNC']);
const MAX_VAT_PERCENT = 100;

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
 * content is checked by `LocalDocumentInspector`. `preset.*` identifiers are
 * not read: in `e2e` they only matter to the phases without `send`
 * (`buildPreset`).
 *
 * @param rowIndex - Position in the input, 0-based
 * @param rowKey - Stable row key
 * @param values - Merged field values (row > CLI > environment > profile fills)
 * @param context - Run-level facts
 * @returns The record, or the issues that make the row invalid
 */
export function buildRecord(
  rowIndex: number,
  rowKey: string,
  values: FieldValues,
  context: RecordBuildContext,
): RecordBuildResult {
  const reader = new FieldReader(values, NEUTRAL_DEFAULTS);

  const subject = reader.required('subject', 134);
  const abstract = reader.optional('abstract', 1024);
  const sender = readSender(reader, context);
  const recipient = readRecipient(reader);
  const physicalAddress = readPhysicalAddress(reader, false);
  const digitalDomicile = readDigitalDomicile(reader);
  const product = readProduct(reader);
  const payment = readPayment(reader);
  const options = readOptions(reader);
  const documents = readDocuments(reader, context);

  if (
    reader.hasIssues() ||
    subject === undefined ||
    sender === undefined ||
    recipient === undefined ||
    physicalAddress === undefined ||
    product === undefined ||
    options === undefined ||
    documents === undefined
  ) {
    return reader.failure();
  }
  return {
    ok: true,
    record: {
      rowIndex,
      rowKey,
      subject,
      ...(abstract !== undefined && { abstract }),
      sender,
      recipient,
      physicalAddress,
      ...(digitalDomicile !== undefined && { digitalDomicile }),
      product,
      documents,
      ...(payment !== undefined && { payment }),
      options,
    },
  };
}

function readProduct(reader: FieldReader): string | undefined {
  const raw = reader.valueOrDefault('product');
  const product = raw === undefined ? undefined : E2E_PRODUCTS.get(raw.toUpperCase());
  if (product === undefined) {
    reader.issue('UNSUPPORTED_PRODUCT', 'product', `product "${raw ?? ''}" is not supported in e2e mode (AR, 890)`);
  }
  return product;
}

/** Optional: absent when neither the notice code nor the creditor is set. */
function readPayment(reader: FieldReader): DispatchPayment | undefined {
  const noticeCode = reader.value('payment.noticeCode');
  const creditorTaxId = reader.value('payment.creditorTaxId');
  if (noticeCode === undefined && creditorTaxId === undefined) return undefined;
  const checkedNotice = reader.matching('payment.noticeCode', NOTICE_CODE, '18 digits', true);
  const checkedCreditor = reader.matching('payment.creditorTaxId', CREDITOR_TAX_ID, '11 digits', true);
  const applyCostRaw = reader.value('payment.applyCost')?.toLowerCase();
  const applyCostValid = applyCostRaw === undefined || applyCostRaw === 'true' || applyCostRaw === 'false';
  if (!applyCostValid) {
    reader.issue('INVALID_FORMAT', 'payment.applyCost', 'payment.applyCost must be true or false');
  }
  if (checkedNotice === undefined || checkedCreditor === undefined || !applyCostValid) return undefined;
  return { noticeCode: checkedNotice, creditorTaxId: checkedCreditor, applyCost: applyCostRaw === 'true' };
}

/**
 * Required. With `DELIVERY_MODE` SEND needs both `paFee` (euro cents) and
 * `vat` (percentage, 0-100) to compute the cost of the notification.
 */
function readOptions(reader: FieldReader): DispatchNotificationOptions | undefined {
  const group = reader.optional('notificationOptions.group', 1024);
  const taxonomyCode = reader.matching(
    'notificationOptions.taxonomyCode',
    TAXONOMY_CODE,
    '6 digits followed by A or N',
    true,
  );
  const feePolicy = reader.oneOf('notificationOptions.notificationFeePolicy', FEE_POLICIES, true);
  const intMode = reader.oneOf('notificationOptions.pagoPaIntMode', INT_MODES, true);
  const paFee = reader.integer('notificationOptions.paFee', 'euro cents');
  const vat = reader.integer('notificationOptions.vat', 'percent', MAX_VAT_PERCENT);
  const paProtocolNumber = reader.optional('notificationOptions.paProtocolNumber', 256);
  const expiration = readDate(reader, 'notificationOptions.paymentExpirationDate');
  if (feePolicy === 'DELIVERY_MODE') {
    for (const field of ['notificationOptions.paFee', 'notificationOptions.vat'] as const) {
      if (reader.value(field) === undefined) {
        reader.issue('MISSING_FIELD', field, `${field} is required when notificationFeePolicy is DELIVERY_MODE`);
      }
    }
  }
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

/** Optional `YYYY-MM-DD` that must also be a real calendar day (no 2026-02-31). */
function readDate(reader: FieldReader, field: CanonicalField): string | undefined {
  const value = reader.matching(field, ISO_DATE, 'YYYY-MM-DD', false);
  if (value === undefined) return undefined;
  if (!isCalendarDate(value)) {
    reader.issue('INVALID_FORMAT', field, `${field} "${value}" is not a calendar date`);
    return undefined;
  }
  return value;
}

/** Whether a `YYYY-MM-DD` string (already format-checked) names an existing day. */
function isCalendarDate(value: string): boolean {
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
