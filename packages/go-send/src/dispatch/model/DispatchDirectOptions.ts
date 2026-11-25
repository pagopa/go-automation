import type { DirectAttachmentRef } from './DirectAttachmentRef.js';
import type { DirectReturnAddress } from './DirectReturnAddress.js';
import type { DirectSenderAddress } from './DirectSenderAddress.js';

/**
 * Fields of a record used only by the `direct` mode (§9.2).
 */
export interface DispatchDirectOptions {
  /** `requestId` generated from the template (§6.3). */
  readonly requestId: string;
  /** `printType` (default `BN_FRONTE_RETRO`). */
  readonly printType: string;
  /** Avviso di avvenuta ricezione (`PN_AAR`), already in SafeStorage (§9.3). */
  readonly aar: DirectAttachmentRef;
  readonly sender: DirectSenderAddress;
  readonly returnAddress?: DirectReturnAddress;
}
