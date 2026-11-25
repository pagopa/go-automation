import type { TimeRangeFromParams } from '../../../../common/time/TimeRangeFromParams.js';
import type { ServiceLogSpec } from '../profiles/ServiceLogSpec.js';

/** The grouped read of the logs of a SEND service. */
export interface ServiceLogsLevelReaderConfig {
  readonly id: string;
  readonly label: string;
  readonly serviceName: string;
  readonly logGroups: ReadonlyArray<string>;
  readonly timeRangeFromParams: TimeRangeFromParams;
  readonly spec: ServiceLogSpec;
  readonly queryProfileId: string;
  /** Query of the service in place of the one of the profile; it keeps the `{{FILTER_CLAUSE}}` placeholder. */
  readonly queryTemplateOverride?: string;
}
