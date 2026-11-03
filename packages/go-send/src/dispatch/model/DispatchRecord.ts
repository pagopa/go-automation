import type { DispatchDigitalDomicile } from './DispatchDigitalDomicile.js';
import type { DispatchNotificationOptions } from './DispatchNotificationOptions.js';
import type { DispatchPayment } from './DispatchPayment.js';
import type { DispatchPhysicalAddress } from './DispatchPhysicalAddress.js';
import type { DispatchRecipient } from './DispatchRecipient.js';
import type { DispatchSender } from './DispatchSender.js';
import type { DocumentSource } from './DocumentSource.js';
import type { PresetIds } from './PresetIds.js';
import type { DispatchDirectOptions } from './DispatchDirectOptions.js';

/**
 * Canonical, validated representation of one input row (§6.1).
 *
 * The original row is not kept: the materializer re-reads the input.
 */
export interface DispatchRecord {
  /** Position in the input, 0-based. */
  readonly rowIndex: number;
  /** Stable row key (§6.3). */
  readonly rowKey: string;
  /** Required in `e2e`; empty in `direct`. */
  readonly subject: string;
  readonly abstract?: string;
  readonly sender: DispatchSender;
  readonly recipient: DispatchRecipient;
  readonly physicalAddress: DispatchPhysicalAddress;
  readonly digitalDomicile?: DispatchDigitalDomicile;
  /** Canonical product: `AR` or `890` in `e2e`, any consolidator code in `direct`. */
  readonly product: string;
  readonly documents: DocumentSource;
  readonly payment?: DispatchPayment;
  readonly options: DispatchNotificationOptions;
  readonly preset?: PresetIds;
  /** Only in `direct` mode. */
  readonly direct?: DispatchDirectOptions;
}
