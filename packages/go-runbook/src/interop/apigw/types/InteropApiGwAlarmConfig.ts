import type { CaseAction } from '../../../actions/CaseAction.js';
import type { KnownCase } from '../../../types/KnownCase.js';
import type { OccurrenceTimeWindow } from '../../../types/OccurrenceTimeWindow.js';
import type { RunbookMetadata } from '../../../types/RunbookMetadata.js';
import type { RunbookAnalysisDefaults } from '../../../types/RunbookAnalysisDefaults.js';
import type { TimeRangeFromParams } from '../../../steps/data/TimeRangeFromParams.js';
import type { InteropApiGwQueryProfile } from '../profiles/InteropApiGwQueryProfile.js';
import type { ResolveInteropApiGwAlarmContextFn } from './InteropApiGwAlarmContext.js';
import type { InteropApiGwRunbookStepIds } from './InteropApiGwRunbookStepIds.js';

/** The API Gateway access-log side of the pipeline. */
interface InteropApiGwAccessLogConfig {
  /** Access log group template, surfaced in `runbookContext`. */
  readonly logGroupTemplate: string;
  /**
   * Profile advertised in `runbookContext`, which the output builders read.
   * Describes the runbook; not necessarily the profile of a single query.
   */
  readonly profileId: string;
}

/** The k8s application-log side of the pipeline. */
interface InteropApiGwApplicationLogConfig {
  /** Pod app under analysis; also the primary analysis resource. */
  readonly serviceName: string;
  /** Application log group template, surfaced in `runbookContext`. */
  readonly logGroupTemplate: string;
  /** Prefix of the context vars the analysis writes. */
  readonly varPrefix: string;
  /**
   * Value the query filters `pod_app` on, when it is not {@link serviceName}.
   * The auth-server pods are named `…-node` but the filter matches the
   * broader `…-authorization-server` family.
   */
  readonly podAppFilter?: string;
  /**
   * Time range for the application query, when it differs from the API
   * Gateway one — a warning scan may need to stop at the alarm instant.
   */
  readonly timeRangeFromParams?: TimeRangeFromParams;
  /** Field carrying the row count, when the query aggregates. */
  readonly countField?: string;
  /** Label rendered for the application-log rows. */
  readonly label?: string;
}

/** Configuration accepted by `createInteropApiGwAlarmRunbook`. */
export interface InteropApiGwAlarmConfig {
  readonly id: string;
  readonly metadata: Omit<RunbookMetadata, 'id'>;
  /** Identifies the resolver in the trace. */
  readonly resolverId: string;
  readonly resolveAlarmContext: ResolveInteropApiGwAlarmContextFn;
  /** The two queries the pipeline runs. */
  readonly queryProfile: InteropApiGwQueryProfile;
  readonly apiGw: InteropApiGwAccessLogConfig;
  readonly application: InteropApiGwApplicationLogConfig;
  readonly knownCases: ReadonlyArray<KnownCase>;
  /** Time range shared by the API Gateway and CID tracker queries. */
  readonly timeRangeFromParams?: TimeRangeFromParams;
  readonly occurrenceTimeWindow?: OccurrenceTimeWindow;
  readonly analysisDefaults?: RunbookAnalysisDefaults;
  readonly fallbackAction?: CaseAction;
  readonly stepIds?: Partial<InteropApiGwRunbookStepIds>;
  readonly maxIterations?: number;
}
