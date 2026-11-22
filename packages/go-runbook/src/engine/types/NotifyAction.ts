/**
 * Send a notification (Slack, email, etc.).
 */
export interface NotifyAction {
  readonly type: 'notify';
  readonly channel: string;
  /** Message template supporting {{vars.xxx}} interpolation */
  readonly template: string;
}
