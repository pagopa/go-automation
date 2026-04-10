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
  /** ZIP code (optional for foreign addresses) */
  zip?: string;
  /** Municipality/City */
  municipality: string;
  /** Municipality details */
  municipalityDetails?: string | undefined;
  /** Province (optional for foreign addresses) */
  province?: string;
  /** Foreign state (for international addresses) */
  foreignState?: string | undefined;
}
