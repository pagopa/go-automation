import type { CaseAction } from '../../actions/CaseAction.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { OccurrenceTimeWindow } from '../../types/OccurrenceTimeWindow.js';
import type { RunbookMetadata } from '../../types/RunbookMetadata.js';
import type { RunbookAnalysisDefaults } from '../../types/RunbookAnalysisDefaults.js';
import type { PipelineHook } from '../../types/PipelineHook.js';
import type { ServicePipelineAnchor } from './ServicePipelineAnchor.js';
import type { ServiceLogQueryProfile } from '../profiles/ServiceLogQueryProfile.js';
import type { ServiceDescriptor } from './ServiceDescriptor.js';

/**
 * Configurazione dichiarativa per runbook che risolvono un allarme leggendo
 * direttamente i log applicativi di un servizio.
 *
 * Non assume l'origine dell'allarme: può essere ALB, metrica applicativa,
 * composite alarm o qualunque segnale in cui la diagnosi parte dal log group
 * del servizio.
 */
export interface ServiceAlarmConfig {
  /** Identificatore univoco del runbook. */
  readonly id: string;
  /** Metadati (l'`id` è preso da {@link ServiceAlarmConfig.id}). */
  readonly metadata: Omit<RunbookMetadata, 'id'>;
  /** Servizio applicativo da analizzare. */
  readonly service: ServiceDescriptor;
  /** Casi noti valutati contro il contesto risultante. */
  readonly knownCases: ReadonlyArray<KnownCase>;
  /** Finestra diagnostica opzionale; in assenza vale il default del catalogo. */
  readonly occurrenceTimeWindow?: OccurrenceTimeWindow;
  /** Extra analysis references; the builder always prepends the primary resource. */
  readonly analysisDefaults?: RunbookAnalysisDefaults;
  /**
   * Custom steps spliced into the canonical pipeline at named points.
   *
   * See {@link ServicePipelineAnchor} for the available positions.
   */
  readonly hooks?: ReadonlyArray<PipelineHook<ServicePipelineAnchor>>;
  /**
   * Action eseguita quando nessun caso noto matcha. Quando omessa, la
   * factory genera una default action che riassume i log raccolti.
   */
  readonly fallbackAction?: CaseAction;
  /** Profilo query/schema. Defaults to SEND service logs. */
  readonly queryProfile?: ServiceLogQueryProfile;
  /** Limite iterazioni anti-loop opzionale forwarded all'engine. */
  readonly maxIterations?: number;
}
