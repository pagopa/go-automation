/**
 * Digital domicile (PEC address)
 */
export interface SENDDigitalDomicile {
  /** Type (always PEC for now) */
  type: 'PEC';
  /** PEC email address */
  address: string;
}
