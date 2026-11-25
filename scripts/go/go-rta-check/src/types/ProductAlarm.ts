import type { AlarmDto } from '@go-automation/go-watchtower-client';

/** Resolved product + alarm (runbook) to test. */
export interface ProductAlarm {
  readonly productId: string;
  readonly productName: string;
  readonly alarm: AlarmDto;
  readonly alarmName: string;
}
