/**
 * Canonical fields a mapping profile, an environment `defaults` block or a
 * CLI override can set (§6.1, §7.3). The list is closed: unknown names are a
 * configuration error, so typos are caught at load time.
 */
export const CANONICAL_FIELDS = [
  'subject',
  'abstract',
  'sender.taxId',
  'sender.denomination',
  'recipient.type',
  'recipient.taxId',
  'recipient.denomination',
  'physicalAddress.at',
  'physicalAddress.address',
  'physicalAddress.addressDetails',
  'physicalAddress.zip',
  'physicalAddress.municipality',
  'physicalAddress.municipalityDetails',
  'physicalAddress.province',
  'physicalAddress.foreignState',
  'digitalDomicile.type',
  'digitalDomicile.address',
  'product',
  'documents.pratica',
  'documents.files',
  'documents.titles',
  'documents.reference.key',
  'documents.reference.versionToken',
  'documents.reference.sha256',
  'documents.reference.title',
  'payment.noticeCode',
  'payment.creditorTaxId',
  'payment.applyCost',
  'notificationOptions.group',
  'notificationOptions.taxonomyCode',
  'notificationOptions.notificationFeePolicy',
  'notificationOptions.paFee',
  'notificationOptions.vat',
  'notificationOptions.pagoPaIntMode',
  'notificationOptions.paProtocolNumber',
  'notificationOptions.paymentExpirationDate',
  'preset.iun',
  'preset.notificationRequestId',
  'direct.printType',
  'direct.aar.key',
  'direct.aar.sha256',
  'direct.sender.address',
  'direct.sender.city',
  'direct.sender.province',
  'direct.sender.digitalAddress',
  'direct.returnAddress.name',
  'direct.returnAddress.address',
  'direct.returnAddress.zip',
  'direct.returnAddress.city',
] as const;

const CANONICAL_FIELD_SET: ReadonlySet<string> = new Set<string>(CANONICAL_FIELDS);

/**
 * Type guard for canonical field names.
 *
 * @param name - Candidate name
 * @returns Whether `name` is a canonical field
 */
export function isCanonicalField(name: string): name is (typeof CANONICAL_FIELDS)[number] {
  return CANONICAL_FIELD_SET.has(name);
}
