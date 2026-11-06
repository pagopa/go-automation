/**
 * Digital domicile of the recipient. SEND accepts only `PEC` in requests.
 */
export interface DispatchDigitalDomicile {
  readonly type: 'PEC';
  readonly address: string;
}
