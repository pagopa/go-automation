import type { AWSActiveOperationRegistry, AWSExecutionTarget } from '@pagopa/go-aws';

import type { OccurrenceServiceBindingMode } from './OccurrenceServiceBindingMode.js';

/** How to bind a service registry to one alarm occurrence. */
export interface BindServicesToOccurrenceOptions {
  /** Source account and region of the occurrence. */
  readonly target: AWSExecutionTarget;
  /** Registry of the remote operations of this occurrence, stopped by the caller in `finally`. */
  readonly activeOperations: AWSActiveOperationRegistry;
  /** Where the product logs are read from. */
  readonly mode: OccurrenceServiceBindingMode;
}
