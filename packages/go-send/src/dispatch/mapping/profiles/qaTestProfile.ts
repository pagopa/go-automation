import type { MappingProfile } from '../MappingProfile.js';
import { COMMON_TRANSFORMS } from './commonTransforms.js';

/**
 * Profile of the QA test CSV template (replaces `QATestFormatAdapter`).
 *
 * Environment-specific values (group, document, sender) are no longer here:
 * they come from the selected environment (§7.4).
 */
export const QA_TEST_PROFILE: MappingProfile = {
  name: 'qa-test',
  format: { type: 'csv', delimiter: ',', skipRows: 0, encoding: 'utf8' },
  columns: {
    Scenario: 'subject',
    Destinatario: 'recipient.taxId',
    Denomination: 'recipient.denomination',
    'Indirizzo PEC': 'digitalDomicile.address',
    CAP: 'physicalAddress.zip',
    Provincia: 'physicalAddress.province',
    Citta: 'physicalAddress.municipality',
    Stato: 'physicalAddress.foreignState',
    Indirizzo: 'physicalAddress.address',
    Sender: 'sender.denomination',
    'Tax ID': 'sender.taxId',
    Prodotto: 'product',
    physicalCommunicationType: 'product',
    Pratica: 'documents.pratica',
    Documento: 'documents.files',
    'Titolo documento': 'documents.titles',
    iun: 'preset.iun',
  },
  transforms: COMMON_TRANSFORMS,
  rowKeyColumn: 'ID_Scenario',
  outputColumns: { iun: 'iun', requestId: 'RequestID' },
};
