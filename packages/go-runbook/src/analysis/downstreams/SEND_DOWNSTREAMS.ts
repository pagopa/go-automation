/**
 * Downstream catalog of the SEND product.
 *
 * Values replicate the Watchtower census byte for byte: the apply resolves them
 * with an exact, case-sensitive match. Keys are CONSTANT_CASE. Census data, not
 * logic — the authoritative source stays the Watchtower `downstreams` table and
 * the Fase 0 coverage check verifies every declared value against it.
 */
export const SEND_DOWNSTREAMS = {
  ADE: 'AdE',
  AMAZON_SES_MAIL: 'Amazon SES (Mail)',
  AMAZON_SNS_SMS: 'Amazon SNS (SMS)',
  ANPR: 'ANPR',
  APP_IO: 'AppIO',
  CHECKOUT_PAGOPA: 'Checkout pagoPA',
  CONSOLIDATORE_POSTALE: 'Consolidatore postale',
  CSCA: 'CSCA - Italian Country Signing Certification Authority',
  // Typo ("Rappresentate") replicated from the WT census: the match is byte for
  // byte. If the census is corrected, correct this value too (Fase 0).
  ELENCO_LEGALE_RAPPRESENTANTE_INFOCAMERE: 'Elenco Legale Rappresentate (InfoCamere)',
  EMD_MULTICANALITA: 'EMD (Multicanalità)',
  INAD: 'INAD',
  INFOCAMERE: 'InfoCamere',
  INI_PEC: 'Ini-PEC',
  IPA: 'IPA',
  KONECTA: 'Konecta',
  MIL_AUTH: 'MIL_AUTH',
  NAMIRIAL: 'Namirial',
  NESSUNO: 'Nessuno',
  OCR: 'OCR',
  ONE_TRUST: 'One-Trust',
  PDND_INTEROPERABILITA: 'PDND - Interoperabilità',
  PERSONAL_DATA_VAULT: 'Personal Data Vault',
  // Spelling "Infocamere" (lowercase c) replicated from the WT census.
  RICHIESTA_ELENCO_PEC_INFOCAMERE: 'Richiesta Elenco PEC (Infocamere)',
  SELFCARE: 'SelfCare',
  SERVER_PEC: 'Server PEC',
  SPID: 'SPID',
  SUBMIT_MESSAGE: 'submitMessage',
  VERIFICA_LEGALE_RAPPRESENTANTE_ADE: 'Verifica legale rappresentante (AdE)',
} as const;

export type SendDownstream = (typeof SEND_DOWNSTREAMS)[keyof typeof SEND_DOWNSTREAMS];
