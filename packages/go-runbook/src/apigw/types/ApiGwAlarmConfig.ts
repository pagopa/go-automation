import type { RunbookMetadata } from '../../types/RunbookMetadata.js';
import type { StepDescriptor } from '../../types/StepDescriptor.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { CaseAction } from '../../actions/CaseAction.js';
import type { ApiGwService } from './ApiGwService.js';
import type { KnownUrl } from './KnownUrl.js';
import type { ApiGwQueryTemplates } from './ApiGwQueryTemplates.js';

/**
 * Declarative configuration consumed by {@link createApiGwAlarmRunbook}.
 *
 * The factory assembles a fully-validated {@link Runbook} from these
 * inputs so the runbook authors only need to provide the data that is
 * actually specific to their alarm (entry service, services, known URLs,
 * known cases).
 *
 * The pipeline is **dynamic**: only the entry service runs by default;
 * every other service is reached only when a {@link KnownUrl} observed
 * during analysis points to it.
 */
export interface ApiGwAlarmConfig {
  /** Unique runbook identifier */
  readonly id: string;
  /** Runbook metadata (the `id` is taken from {@link ApiGwAlarmConfig.id}) */
  readonly metadata: Omit<RunbookMetadata, 'id'>;
  /** Log group of the API Gateway whose AccessLog triggered the alarm */
  readonly apiGwLogGroup: string;
  /**
   * Minimum HTTP status code that counts as an error. Default `500`,
   * mirroring the canonical query from `go-runbooks`.
   */
  readonly minStatusCode?: number;
  /**
   * Entry service: the first microservice analysed for any trace that
   * survived the API Gateway parsing step. Required.
   */
  readonly entryService: ApiGwService;
  /**
   * Additional microservices reachable from {@link entryService} through
   * known URLs. Order does not matter — these services are visited only
   * when a {@link KnownUrl} resolved during analysis names them as the
   * target.
   */
  readonly services?: ReadonlyArray<ApiGwService>;
  /** Known URLs used to enrich the trace and drive the analysis loop. */
  readonly knownUrls: ReadonlyArray<KnownUrl>;
  /**
   * Custom steps inserted between the API Gateway parsing step and the
   * per-service pipeline (typical use case: a Lambda authorizer probe).
   */
  readonly preSteps?: ReadonlyArray<StepDescriptor>;
  /** Known cases scored against the resulting context */
  readonly knownCases: ReadonlyArray<KnownCase>;
  /**
   * Action executed when no known case matches. When omitted the
   * factory generates a default action that summarises the collected
   * vars (including `terminationReason`).
   */
  readonly fallbackAction?: CaseAction;
  /** Optional template overrides */
  readonly queryTemplates?: ApiGwQueryTemplates;
  /** Optional anti-loop iteration limit forwarded to the engine */
  readonly maxIterations?: number;
}
