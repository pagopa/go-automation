import { DescribeAlarmHistoryCommand } from '@aws-sdk/client-cloudwatch';
import type {
  AlarmHistoryItem,
  AlarmType,
  CloudWatchClient,
  DescribeAlarmHistoryCommandInput,
  HistoryItemType,
  ScanBy,
} from '@aws-sdk/client-cloudwatch';

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_ALARM_TYPES: ReadonlyArray<AlarmType> = ['CompositeAlarm', 'MetricAlarm'];

export interface AWSCloudWatchAlarmHistoryTimeRange {
  readonly start: Date;
  readonly end: Date;
}

export interface AWSCloudWatchAlarmHistoryOptions {
  readonly timeRange: AWSCloudWatchAlarmHistoryTimeRange;
  readonly alarmName?: string;
  readonly alarmTypes?: ReadonlyArray<AlarmType>;
  readonly historyItemType?: HistoryItemType;
  readonly scanBy?: ScanBy;
  readonly pageSize?: number;
}

export type AWSCloudWatchAlarmStateTransitionOptions = Omit<AWSCloudWatchAlarmHistoryOptions, 'historyItemType'>;

export type AWSCloudWatchAlarmHistoryStringKey = {
  [K in keyof AlarmHistoryItem]-?: NonNullable<AlarmHistoryItem[K]> extends string ? K : never;
}[keyof AlarmHistoryItem];

/** Queries CloudWatch alarm history through the shared AWS client provider. */
export class AWSCloudWatchAlarmsService {
  constructor(private readonly client: CloudWatchClient) {}

  /** Retrieves every page of alarm history without mutating the supplied options. */
  async describeAlarmHistory(
    options: AWSCloudWatchAlarmHistoryOptions,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<AlarmHistoryItem>> {
    const input = buildDescribeAlarmHistoryInput(options);
    const items: AlarmHistoryItem[] = [];
    let nextToken: string | undefined;

    while (true) {
      const response = await this.client.send(
        new DescribeAlarmHistoryCommand({
          ...input,
          ...(nextToken === undefined ? {} : { NextToken: nextToken }),
        }),
        signal === undefined ? {} : { abortSignal: signal },
      );
      items.push(...(response.AlarmHistoryItems ?? []));

      const returnedToken = response.NextToken;
      if (returnedToken === undefined || returnedToken === '' || returnedToken === nextToken) break;
      nextToken = returnedToken;
    }

    return items;
  }

  /** Retrieves state updates and keeps only OK-to-ALARM transitions. */
  async describeAlarmStateTransitions(
    options: AWSCloudWatchAlarmStateTransitionOptions,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<AlarmHistoryItem>> {
    const items = await this.describeAlarmHistory({ ...options, historyItemType: 'StateUpdate' }, signal);
    return items.filter(isCloudWatchAlarmStateTransition);
  }
}

/** Returns true when a state-update history item represents an OK-to-ALARM transition. */
export function isCloudWatchAlarmStateTransition(item: AlarmHistoryItem): boolean {
  if (item.HistoryData === undefined) return false;
  try {
    const data = JSON.parse(item.HistoryData) as {
      readonly oldState?: { readonly stateValue?: unknown };
      readonly newState?: { readonly stateValue?: unknown };
    };
    return data.oldState?.stateValue === 'OK' && data.newState?.stateValue === 'ALARM';
  } catch {
    return false;
  }
}

/** Extracts defined string values for a string-valued alarm-history property. */
export function getAlarmHistoryStringValues(
  items: ReadonlyArray<AlarmHistoryItem>,
  key: AWSCloudWatchAlarmHistoryStringKey,
): ReadonlyArray<string> {
  const values: string[] = [];
  for (const item of items) {
    const value = item[key];
    if (typeof value === 'string') values.push(value);
  }
  return values;
}

/** Converts available timestamps to ISO strings, optionally filtering by alarm name. */
export function getAlarmHistoryIsoTimestamps(
  items: ReadonlyArray<AlarmHistoryItem>,
  alarmName?: string,
): ReadonlyArray<string> {
  return items
    .filter((item) => alarmName === undefined || item.AlarmName === alarmName)
    .flatMap((item) => (item.Timestamp === undefined ? [] : [item.Timestamp.toISOString()]));
}

/** Selects a subset of properties from every alarm-history item. */
export function selectAlarmHistoryProperties<K extends keyof AlarmHistoryItem>(
  items: ReadonlyArray<AlarmHistoryItem>,
  keys: ReadonlyArray<K>,
): ReadonlyArray<Pick<AlarmHistoryItem, K>> {
  return items.map((item) => Object.fromEntries(keys.map((key) => [key, item[key]])) as Pick<AlarmHistoryItem, K>);
}

function buildDescribeAlarmHistoryInput(options: AWSCloudWatchAlarmHistoryOptions): DescribeAlarmHistoryCommandInput {
  const start = new Date(options.timeRange.start.getTime());
  const end = new Date(options.timeRange.end.getTime());
  if (Number.isNaN(start.getTime())) throw new Error('CloudWatch alarm history start date is invalid');
  if (Number.isNaN(end.getTime())) throw new Error('CloudWatch alarm history end date is invalid');
  if (start > end) throw new Error('CloudWatch alarm history start date must be before or equal to end date');

  const alarmName = options.alarmName?.trim();
  if (options.alarmName !== undefined && alarmName === '') {
    throw new Error('CloudWatch alarm name cannot be empty');
  }

  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
    throw new Error(`CloudWatch alarm history page size must be an integer between 1 and ${String(DEFAULT_PAGE_SIZE)}`);
  }

  return {
    StartDate: start,
    EndDate: end,
    AlarmTypes: [...(options.alarmTypes ?? DEFAULT_ALARM_TYPES)],
    ScanBy: options.scanBy ?? 'TimestampDescending',
    MaxRecords: pageSize,
    ...(alarmName === undefined ? {} : { AlarmName: alarmName }),
    ...(options.historyItemType === undefined ? {} : { HistoryItemType: options.historyItemType }),
  };
}
