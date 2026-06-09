import type { CaseAction } from '../../actions/CaseAction.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { RunbookMetadata } from '../../types/RunbookMetadata.js';
import type { StepDescriptor } from '../../types/StepDescriptor.js';
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
  /** Step custom inseriti dopo l'analisi dei log errore e prima della query trace. */
  readonly preSteps?: ReadonlyArray<StepDescriptor>;
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
