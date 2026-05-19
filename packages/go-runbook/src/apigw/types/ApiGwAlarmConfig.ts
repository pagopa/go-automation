import type { RunbookMetadata } from '../../types/RunbookMetadata.js';
import type { StepDescriptor } from '../../types/StepDescriptor.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { CaseAction } from '../../actions/CaseAction.js';
import type { ApiGwService } from './ApiGwService.js';
import type { KnownUrl } from './KnownUrl.js';
import type { ApiGwQueryProfile } from '../profiles/ApiGwQueryProfile.js';

/**
 * Declarative configuration consumed by {@link createApiGwAlarmRunbook}.
 *
 * La factory assembla un {@link Runbook} interamente validato a partire
 * da questi input, così che gli autori di runbook debbano fornire solo i
 * dati specifici del proprio allarme (entry service, services, known URLs,
 * known cases).
 *
 * La pipeline è **dinamica**: solo l'entry service è eseguito di default;
 * gli altri servizi sono raggiunti solo quando un {@link KnownUrl}
 * osservato durante l'analisi punta a loro.
 */
export interface ApiGwAlarmConfig {
  /** Identificatore univoco del runbook */
  readonly id: string;
  /** Metadati (l'`id` è preso da {@link ApiGwAlarmConfig.id}) */
  readonly metadata: Omit<RunbookMetadata, 'id'>;
  /** Log group dell'API Gateway su cui è scattato l'allarme */
  readonly apiGwLogGroup: string;
  /**
   * Codice di stato HTTP minimo considerato errore. Default `500`,
   * coerente con la query canonica di `go-runbooks`.
   */
  readonly minStatusCode?: number;
  /**
   * Entry service: il primo microservizio analizzato per qualunque trace
   * sopravvissuto al parsing del API Gateway. Obbligatorio.
   */
  readonly entryService: ApiGwService;
  /**
   * Microservizi aggiuntivi raggiungibili da {@link entryService}
   * attraverso URL noti. L'ordine non conta: ciascun servizio viene
   * visitato solo quando un {@link KnownUrl} risolto in analisi lo cita
   * come target.
   */
  readonly services?: ReadonlyArray<ApiGwService>;
  /** Known URL usati per arricchire il trace e guidare il loop di analisi. */
  readonly knownUrls: ReadonlyArray<KnownUrl>;
  /**
   * Includes pre-steps declared by the resolved query profile.
   *
   * Defaults to `true`. Set to `false` for a runbook that uses a profile
   * but intentionally wants to skip its optional product diagnostics.
   */
  readonly includeProfilePreSteps?: boolean;
  /**
   * Step custom inseriti fra il parsing API Gateway e la pipeline
   * per-servizio, dopo gli eventuali pre-step dichiarati dal profilo.
   */
  readonly preSteps?: ReadonlyArray<StepDescriptor>;
  /** Casi noti valutati contro il contesto risultante */
  readonly knownCases: ReadonlyArray<KnownCase>;
  /**
   * Action eseguita quando nessun caso noto matcha. Quando omessa, la
   * factory genera una default action che riassume le var raccolte
   * (incluso `terminationReason`).
   */
  readonly fallbackAction?: CaseAction;
  /**
   * Profilo di query da usare per assemblare la pipeline.
   */
  readonly queryProfile?: ApiGwQueryProfile;
  /**
   * Override del limite `maxRequestIds` dell'execution log per questo
   * runbook. Quando assente, viene usato `spec.maxRequestIds` (per SEND:
   * 50). Ignorato se la capability executionLog non è attiva.
   */
  readonly executionLogMaxRequestIds?: number;
  /** Limite iterazioni anti-loop opzionale forwarded all'engine */
  readonly maxIterations?: number;
}
