import type { TimeRangeFromParams } from '../../../time/TimeRangeFromParams.js';

export interface ServiceTraceLevelReaderConfig {
  readonly id: string;
  readonly label: string;
  readonly serviceName: string;
  readonly logGroups: ReadonlyArray<string>;
  readonly queryTemplate: string;
  readonly queryProfileId: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
}
