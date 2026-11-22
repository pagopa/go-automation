import type { InteropLogRow } from '../../../../toolkits/interop/index.js';
import type { RequestEvidence } from './RequestEvidence.js';

export interface BffCaseEvidence {
  readonly bffRows: ReadonlyArray<InteropLogRow>;
  readonly purposeRows: ReadonlyArray<InteropLogRow>;
  readonly expiredNotificationRequests: ReadonlyArray<RequestEvidence>;
  readonly selfcareUsersTimeouts: ReadonlyArray<RequestEvidence>;
}
