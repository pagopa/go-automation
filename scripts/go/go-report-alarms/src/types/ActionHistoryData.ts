/**
 * History data for CloudWatch alarm actions (SNS notifications)
 */
export interface ActionHistoryData {
  /** State of the action execution ("Succeeded" or "Failed") */
  readonly actionState: string;

  /** Timestamp of the state update in milliseconds */
  readonly stateUpdateTimestamp: number;

  /** ARN of the SNS topic that received the notification */
  readonly notificationResource: string;

  /** Published message content in different formats */
  readonly publishedMessage: string;

  /** Error message if action failed, null otherwise */
  readonly error: string | null;
}

/**
 * Published message structure within ActionHistoryData.
 */
export interface HistoryDataPublishedMessage {
  /** Default JSON message with full alarm details */
  default: string;
}

/**
 * Published message content for SNS alarm notifications
 */
export interface PublishedMessageDefault {
  /** New state of the alarm (e.g., "ALARM", "OK", "INSUFFICIENT_DATA") */
  readonly NewStateValue: string;

  /** Previous state of the alarm */
  readonly OldStateValue: string;

  /** Name of the alarm */
  readonly AlarmName: string;

  /** Description of the alarm */
  readonly AlarmDescription: string;

  /** Reason for the state change */
  readonly NewStateReason: string;

  /** ISO 8601 timestamp of the state change */
  readonly StateChangeTime: string;

  /** AWS region display name (e.g., "EU (Milan)") */
  readonly Region: string;

  /** ARN of the alarm */
  readonly AlarmArn: string;

  /** AWS account ID */
  readonly AWSAccountId: string;

  /** Configuration update timestamp in ISO 8601 format */
  readonly AlarmConfigurationUpdatedTimestamp: string;

  /** List of SNS topic ARNs for OK actions */
  readonly OKActions: ReadonlyArray<string>;

  /** List of SNS topic ARNs for ALARM actions */
  readonly AlarmActions: ReadonlyArray<string>;
}
