import type { AlarmEventDto } from '@go-automation/go-watchtower-client';

import type { RtaCheckRow } from './RtaCheckReport.js';

/**
 * Progress notification emitted while occurrences are being checked.
 *
 * It is the only channel the library offers towards a user interface: rendering,
 * spinners and console output stay in the CLI adapter.
 */
export type CheckProgressHandler = (event: CheckProgressEvent) => void;

export type CheckProgressEvent =
  | {
      readonly kind: 'OCCURRENCE_STARTED';
      /** 1-based position in the input order. */
      readonly index: number;
      readonly total: number;
      readonly occurrence: AlarmEventDto;
    }
  | {
      readonly kind: 'OCCURRENCE_COMPLETED';
      readonly index: number;
      readonly total: number;
      readonly occurrence: AlarmEventDto;
      readonly row: RtaCheckRow;
    };
