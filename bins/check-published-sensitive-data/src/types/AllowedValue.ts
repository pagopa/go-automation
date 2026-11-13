/** A value the gate accepts everywhere, with the reason it is not sensitive. */
export interface AllowedValue {
  readonly value: string;
  readonly reason: string;
}
