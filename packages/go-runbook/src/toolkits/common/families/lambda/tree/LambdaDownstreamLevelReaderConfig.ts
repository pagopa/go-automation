import type { TimeRangeFromParams } from '../../../time/TimeRangeFromParams.js';
import type { LambdaDownstream } from '../types/LambdaDownstream.js';

/** The grouped read of the logs of a Lambda downstream. */
export interface LambdaDownstreamLevelReaderConfig {
  readonly id: string;
  readonly label: string;
  /** Downstream with its log group. */
  readonly downstream: LambdaDownstream & { readonly logGroup: string };
  /** Query template with the `{{REQUEST_ID_FILTER}}` placeholder. */
  readonly queryTemplate: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
}
