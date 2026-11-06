import type { MappingProfile } from '../MappingProfile.js';

/**
 * Profile of the `direct` mode: columns named like the fields of the
 * pn-external-channels request (§9.2), plus the SafeStorage references of
 * `AAR` and `ATTO`. Replaces the hardcoded values of
 * `consolidatore_con020_PARAM.sh`.
 */
export const DIRECT_PROFILE: MappingProfile = {
  name: 'direct',
  format: { type: 'csv', delimiter: ',', skipRows: 0, encoding: 'utf8' },
  columns: {
    requestPaId: 'sender.taxId',
    senderName: 'sender.denomination',
    senderAddress: 'direct.sender.address',
    senderCity: 'direct.sender.city',
    senderPr: 'direct.sender.province',
    senderDigitalAddress: 'direct.sender.digitalAddress',
    receiverName: 'recipient.denomination',
    receiverNameRow2: 'physicalAddress.at',
    receiverFiscalCode: 'recipient.taxId',
    receiverAddress: 'physicalAddress.address',
    receiverAddressRow2: 'physicalAddress.addressDetails',
    receiverCap: 'physicalAddress.zip',
    receiverCity: 'physicalAddress.municipality',
    receiverCity2: 'physicalAddress.municipalityDetails',
    receiverPr: 'physicalAddress.province',
    receiverCountry: 'physicalAddress.foreignState',
    productType: 'product',
    printType: 'direct.printType',
    arName: 'direct.returnAddress.name',
    arAddress: 'direct.returnAddress.address',
    arCap: 'direct.returnAddress.zip',
    arCity: 'direct.returnAddress.city',
    aarKey: 'direct.aar.key',
    aarSha256: 'direct.aar.sha256',
    attoKey: 'documents.reference.key',
    attoSha256: 'documents.reference.sha256',
    pratica: 'documents.pratica',
    iun: 'preset.iun',
  },
  transforms: {
    'physicalAddress.foreignState': [{ op: 'emptyIfIn', values: ['ITALIA', 'IT'] }],
    product: [{ op: 'upper' }],
  },
  rowKeyColumn: 'id',
  outputColumns: { requestId: 'requestId' },
};
