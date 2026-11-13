import { GODateTokens } from '@pagopa/go-common/dates';

import type { SendMonitorAthenaQueryConfig, TimeRange } from '../types/index.js';

const HOUR_MS = 60 * 60 * 1000;

export function buildTimeRange(config: SendMonitorAthenaQueryConfig): TimeRange {
  const to = hasText(config.to) ? GODateTokens.parse(config.to, config.timeZone) : new Date();
  const from = hasText(config.from)
    ? GODateTokens.parse(config.from, config.timeZone)
    : new Date(to.getTime() - config.timeLookbackHours * HOUR_MS);

  if (from >= to) {
    throw new Error('Invalid time range: from must be before to');
  }

  return { from, to };
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
