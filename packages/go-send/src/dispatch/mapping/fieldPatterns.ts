/**
 * Formats of the canonical fields, compiled once and shared by the record
 * builders and the environments file parser. Limits and formats follow
 * NewNotificationRequestV26 (pn-delivery OpenAPI) and pn-external-channels.
 */

/** `sender.taxId`: tax code of the PA, up to 11 digits. */
export const SENDER_TAX_ID: RegExp = /^\d{1,11}$/;

/**
 * `recipient.taxId` (upper-cased): an Italian codice fiscale of a person
 * (16 characters; digits may be replaced by the omocodia letters
 * `LMNPQRSTUV`, month letter in `ABCDEHLMPRST`) or an 11-digit partita IVA.
 */
export const RECIPIENT_TAX_ID: RegExp =
  /^(?:[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]|\d{11})$/;

/** SHA-256 digest in Base64: 43 characters plus one `=` of padding. */
export const SHA256_BASE64: RegExp = /^[A-Za-z0-9+/]{43}=$/;

/** `notificationOptions.taxonomyCode`: 6 digits plus `A` or `N` (SEND taxonomy). */
export const TAXONOMY_CODE: RegExp = /^\d{6}[AN]$/;

/** `YYYY-MM-DD`; the calendar check is done separately. */
export const ISO_DATE: RegExp = /^\d{4}-(1[0-2]|0[1-9])-(3[01]|[12]\d|0[1-9])$/;

/** `payment.noticeCode`: pagoPA notice code of 18 digits. */
export const NOTICE_CODE: RegExp = /^\d{18}$/;

/** `payment.creditorTaxId`: tax code of the creditor body, 11 digits. */
export const CREDITOR_TAX_ID: RegExp = /^\d{11}$/;

/** Italian ZIP code. */
export const ITALIAN_ZIP: RegExp = /^\d{5}$/;

/** Consolidator product code of the `direct` mode (`AR`, `890`, `RS`…). */
export const PRODUCT_CODE: RegExp = /^[A-Z0-9_]{1,20}$/;

/** `notificationRequestId`: Base64 of an IUN (36 characters). */
export const NOTIFICATION_REQUEST_ID: RegExp = /^[A-Za-z0-9+/=]{36}$/;
