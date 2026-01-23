/**
 * Physical address for analog notifications
 */
export interface SENDPhysicalAddress {
  /** Care of (c/o) */
  at?: string | undefined;
  /** Street address */
  address: string;
  /** Additional address details */
  addressDetails?: string | undefined;
  /** ZIP code */
  zip: string;
  /** Municipality/City */
  municipality: string;
  /** Municipality details */
  municipalityDetails?: string | undefined;
  /** Province code (2 letters) */
  province: string;
  /** Foreign state (for international addresses) */
  foreignState?: string | undefined;
}
