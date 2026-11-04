import type { SENDApiVersion, Dispatch } from '@go-automation/go-send';

import type { DispatchDurations } from './DispatchDurations.js';
import type { DispatchPhaseName } from './DispatchPhaseName.js';
import type { SendDispatchNotificationsConfig } from './SendDispatchNotificationsConfig.js';

/**
 * Fields of the validated configuration shared by both modes: the raw
 * configuration with enumerations narrowed to their literal types, durations
 * parsed and `--defaults` parsed into canonical field values.
 */
export interface ValidatedConfigBase extends Omit<
  SendDispatchNotificationsConfig,
  | 'mode'
  | 'inputFormat'
  | 'outputFormat'
  | 'apiVersion'
  | 'defaults'
  | 'ecBaseUrl'
  | 'phases'
  | 'requestIdSelect'
  | 'requestIdWait'
  | 'httpTimeout'
  | 'sendTimeout'
  | 'verifyInitialDelay'
  | 'verifyTimeout'
  | 'requestIdInitialDelay'
  | 'requestIdTimeout'
  | 'uploadReuseMaxAge'
> {
  readonly inputFormat?: Dispatch.InputFormat;
  readonly outputFormat?: Dispatch.InputFormat;
  readonly apiVersion: SENDApiVersion;
  /** `--defaults`, parsed (§7.4.2). */
  readonly fieldDefaults: Dispatch.FieldValues;
  readonly phases: ReadonlyArray<DispatchPhaseName>;
  readonly requestIdSelect: Dispatch.RequestIdSelect;
  readonly requestIdWait: Dispatch.RequestIdWait;
  readonly durations: DispatchDurations;
}
