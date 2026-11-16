import type { InteropEnvironment } from '../../../environment/InteropEnvironment.js';
import type { InteropApiGwAlarmNameFn } from './InteropApiGwAlarmNameFn.js';

/** What distinguishes one INTEROP API Gateway alarm runbook from its siblings (EVO-RBREORG-OPUS-01 P30). */
export interface InteropApiGwAlarmSpec {
  /** Runbook key. */
  readonly runbookKey: string;
  /** Pod app under analysis; also the primary analysis resource. */
  readonly serviceName: string;
  /** Value the application query filters on, when it is not {@link serviceName}. */
  readonly podAppFilter?: string;
  /** Prefix of the context vars the analysis writes. */
  readonly varPrefix: string;
  /** Profile advertised in `runbookContext`; describes this runbook. */
  readonly apiGwProfileId: string;
  /** REST API id in each environment. */
  readonly apiGwIds: Readonly<Record<InteropEnvironment, string>>;
  /** CloudWatch alarm of each environment: the names do not follow from the runbook key. */
  readonly alarmName: InteropApiGwAlarmNameFn;
  /** Alarms that exist only in some environments (for example `-low-requests` variants), listed after the others. */
  readonly additionalAlarms?: ReadonlyArray<{ readonly name: string; readonly environment: InteropEnvironment }>;
}
