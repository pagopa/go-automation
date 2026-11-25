/**
 * Sender details printed on the envelope (`sender*` fields of pn-ec).
 */
export interface DirectSenderAddress {
  readonly address?: string;
  readonly city?: string;
  readonly province?: string;
  readonly digitalAddress?: string;
}
