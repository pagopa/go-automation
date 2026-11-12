/**
 * pagoPA payment notice attached to the recipient.
 */
export interface DispatchPayment {
  readonly noticeCode: string;
  readonly creditorTaxId: string;
  readonly applyCost: boolean;
}
