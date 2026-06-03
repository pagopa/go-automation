import type { LambdaQueryProfile } from './LambdaQueryProfile.js';
import { DEFAULT_LAMBDA_ERROR_QUERY } from '../queries/DEFAULT_LAMBDA_ERROR_QUERY.js';
import { DEFAULT_LAMBDA_INVOCATION_QUERY } from '../queries/DEFAULT_LAMBDA_INVOCATION_QUERY.js';

/** Default Lambda query profile for the SEND product. */
export const SEND_LAMBDA_PROFILE: LambdaQueryProfile = {
  id: 'send',
  errorQuery: DEFAULT_LAMBDA_ERROR_QUERY,
  invocationQueryTemplate: DEFAULT_LAMBDA_INVOCATION_QUERY,
};
