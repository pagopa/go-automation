import { AutomaticRunbookKinds } from '@go-automation/go-execute-runbook-contracts';

import type { AutomaticRunbookRegistration } from '../../AutomaticRunbookRegistration.js';
import { RunbookProducts } from '../../../types/RunbookProduct.js';
import { buildWorkdayPnExternalChannelAlbAlarmRunbook } from './runbook.js';

const KEY = 'workday-pn-external-channel-alb-alarm';

export const WORKDAY_EXTERNAL_CHANNEL_ALB_REGISTRATION: AutomaticRunbookRegistration = {
  key: KEY,
  product: RunbookProducts.SEND,
  kind: AutomaticRunbookKinds.SERVICE,
  categories: ['DELIVERY'],
  alarmNames: [KEY],
  build: buildWorkdayPnExternalChannelAlbAlarmRunbook,
};
