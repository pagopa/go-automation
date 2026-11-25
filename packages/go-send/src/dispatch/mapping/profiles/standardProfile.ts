import type { MappingProfile } from '../MappingProfile.js';
import { COMMON_TRANSFORMS } from './commonTransforms.js';

/**
 * Profile of the standard SEND CSV format of `send-import-notifications`
 * (one column per field of the former `SENDNotificationRow`).
 */
export const STANDARD_PROFILE: MappingProfile = {
  name: 'standard',
  format: { type: 'csv', delimiter: ',', skipRows: 0, encoding: 'utf8' },
  columns: {
    subject: 'subject',
    abstract: 'abstract',
    senderTaxId: 'sender.taxId',
    senderDenomination: 'sender.denomination',
    group: 'notificationOptions.group',
    taxonomyCode: 'notificationOptions.taxonomyCode',
    paProtocolNumber: 'notificationOptions.paProtocolNumber',
    recipientTaxId: 'recipient.taxId',
    recipientType: 'recipient.type',
    recipientDenomination: 'recipient.denomination',
    physicalCommunicationType: 'product',
    product: 'product',
    notificationFeePolicy: 'notificationOptions.notificationFeePolicy',
    paFee: 'notificationOptions.paFee',
    vat: 'notificationOptions.vat',
    pagoPaIntMode: 'notificationOptions.pagoPaIntMode',
    paymentExpirationDate: 'notificationOptions.paymentExpirationDate',
    physicalAt: 'physicalAddress.at',
    physicalAddress: 'physicalAddress.address',
    physicalAddressDetails: 'physicalAddress.addressDetails',
    physicalZip: 'physicalAddress.zip',
    physicalMunicipality: 'physicalAddress.municipality',
    physicalMunicipalityDetails: 'physicalAddress.municipalityDetails',
    physicalProvince: 'physicalAddress.province',
    physicalForeignState: 'physicalAddress.foreignState',
    digitalType: 'digitalDomicile.type',
    digitalAddress: 'digitalDomicile.address',
    pagoPaNoticeCode: 'payment.noticeCode',
    pagoPaCreditorTaxId: 'payment.creditorTaxId',
    pagoPaApplyCost: 'payment.applyCost',
    documentTitle: 'documents.reference.title',
    documentKey: 'documents.reference.key',
    documentVersionToken: 'documents.reference.versionToken',
    documentSha256: 'documents.reference.sha256',
    documentFilePath: 'documents.files',
    documentTitles: 'documents.titles',
    pratica: 'documents.pratica',
    iun: 'preset.iun',
    notificationRequestId: 'preset.notificationRequestId',
  },
  transforms: COMMON_TRANSFORMS,
};
