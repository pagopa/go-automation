/**
 * @pagopa/go-aws/cloudwatch-alarms — requires the peer `@aws-sdk/client-cloudwatch`.
 */

export { CLOUDWATCH_CLIENT } from '../cloudwatch-metrics/CLOUDWATCH_CLIENT.js';
export {
  AWSCloudWatchAlarmsService,
  getAlarmHistoryIsoTimestamps,
  getAlarmHistoryStringValues,
  isCloudWatchAlarmStateTransition,
  selectAlarmHistoryProperties,
} from './AWSCloudWatchAlarmsService.js';
export type {
  AWSCloudWatchAlarmHistoryOptions,
  AWSCloudWatchAlarmHistoryStringKey,
  AWSCloudWatchAlarmHistoryTimeRange,
  AWSCloudWatchAlarmStateTransitionOptions,
} from './AWSCloudWatchAlarmsService.js';
export type { AlarmHistoryItem, AlarmType, HistoryItemType, ScanBy } from '@aws-sdk/client-cloudwatch';
