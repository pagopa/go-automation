import type { DispatchNotificationOptions } from '../model/DispatchNotificationOptions.js';
import type { DispatchPayment } from '../model/DispatchPayment.js';
import type { NotificationFeePolicy } from '../model/NotificationFeePolicy.js';
import type { PagoPaIntMode } from '../model/PagoPaIntMode.js';
import type { RecipientType } from '../model/RecipientType.js';
import type { CanonicalField } from './CanonicalField.js';
import type { FieldValues } from './FieldValues.js';
import type { RecordBuildContext } from './RecordBuildContext.js';
import type { RecordBuildResult } from './RecordBuildResult.js';
import { FieldReader } from './FieldReader.js';
import { readDigitalDomicile, readDocuments, readPhysicalAddress, readPreset } from './recordReaders.js';

// Limits and formats of NewNotificationRequestV26 (pn-delivery OpenAPI).
const SENDER_TAX_ID = /^\d{1,11}$/;
const TAXONOMY_CODE = /^\d{6}[A-Z]$/;
const DATE = /^\d{4}-(1[0-2]|0[1-9])-(3[01]|[12]\d|0[1-9])$/;
const NOTICE_CODE = /^\d{18}$/;
const CREDITOR_TAX_ID = /^\d{11}$/;

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
  const reader = new FieldReader(values, NEUTRAL_DEFAULTS);

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
  const physicalAddress = readPhysicalAddress(reader, false);
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
