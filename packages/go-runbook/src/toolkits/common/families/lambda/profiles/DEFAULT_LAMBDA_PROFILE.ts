import type { LambdaQueryProfile } from './LambdaQueryProfile.js';
import { DEFAULT_LAMBDA_ERROR_QUERY } from '../queries/DEFAULT_LAMBDA_ERROR_QUERY.js';
import { DEFAULT_LAMBDA_INVOCATION_QUERY } from '../queries/DEFAULT_LAMBDA_INVOCATION_QUERY.js';

/**
 * Generic Lambda query profile: the default error-scan and invocation queries,
 * with no product downstream signature (EVO-RBREORG-OPUS-01 §7.2.2).
 */
export const DEFAULT_LAMBDA_PROFILE: LambdaQueryProfile = {
  id: 'default',
  errorQuery: DEFAULT_LAMBDA_ERROR_QUERY,
  invocationQueryTemplate: DEFAULT_LAMBDA_INVOCATION_QUERY,
  downstreamSignatures: [],
};
