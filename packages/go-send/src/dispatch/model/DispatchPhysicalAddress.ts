/**
 * Physical address of the recipient (canonical form, all values trimmed).
 */
export interface DispatchPhysicalAddress {
  readonly at?: string;
  readonly address: string;
  readonly addressDetails?: string;
  readonly zip?: string;
  readonly municipality: string;
  readonly municipalityDetails?: string;
  readonly province?: string;
  readonly foreignState?: string;
}
