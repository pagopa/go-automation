import { AlarmRunbookBuilder } from './AlarmRunbookBuilder.js';
import type { AlarmRunbookHeadConfig } from './AlarmRunbookHeadConfig.js';

/**
 * Opens an alarm runbook: id, metadata, the read-only cloud policy and, when the config declares it, the occurrence
 * window. The counterpart of `finishAlarmRunbook`: every toolkit builder starts with these steps.
 *
 * @param config - The alarm config being built
 * @returns The builder, ready for the steps of the family
 *
 * @example
 * ```typescript
 * const builder = startAlarmRunbook(config);
 * builder.step(new PrepareServiceSectionStep({ … }), { silent: true });
 * return finishAlarmRunbook(builder, config, { … });
 * ```
 */
export function startAlarmRunbook(config: AlarmRunbookHeadConfig): AlarmRunbookBuilder {
  const builder = AlarmRunbookBuilder.create(config.id)
    .metadata(config.metadata)
    .cloudExecutionPolicy({ sideEffects: 'NONE' });
  if (config.occurrenceTimeWindow !== undefined) builder.occurrenceTimeWindow(config.occurrenceTimeWindow);
  return builder;
}
