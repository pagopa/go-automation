/**
 * Return address of the receipt (`ar*` fields of pn-ec).
 */
export interface DirectReturnAddress {
  readonly name: string;
  readonly address: string;
  readonly zip: string;
  readonly city: string;
}
