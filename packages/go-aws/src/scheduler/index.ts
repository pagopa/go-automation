/**
 * @pagopa/go-aws/scheduler — requires the peer `@aws-sdk/client-scheduler`.
 */

export { SCHEDULER_CLIENT } from './SCHEDULER_CLIENT.js';
export { AWSSchedulerService } from './AWSSchedulerService.js';
export type { AWSScheduleListFilters, AWSScheduleStateChange } from './AWSSchedulerService.js';
export type {
  GetScheduleCommandOutput,
  ScheduleState,
  ScheduleSummary,
  SchedulerClient,
} from '@aws-sdk/client-scheduler';
