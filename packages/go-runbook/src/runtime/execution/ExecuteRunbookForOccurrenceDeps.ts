import type { GOLogger } from '@pagopa/go-common/logging';

import type { ServiceRegistry } from '../../toolkits/common/services/ServiceRegistry.js';

/** Dependencies built once and reused across occurrences. */
export interface ExecuteRunbookForOccurrenceDeps {
  readonly services: ServiceRegistry;
  readonly logger: GOLogger;
}
