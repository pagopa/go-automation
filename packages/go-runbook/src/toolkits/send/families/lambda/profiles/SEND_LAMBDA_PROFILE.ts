import type { LambdaQueryProfile } from '../../../../common/families/lambda/profiles/LambdaQueryProfile.js';
import { DEFAULT_LAMBDA_PROFILE } from '../../../../common/families/lambda/profiles/DEFAULT_LAMBDA_PROFILE.js';

/**
 * Lambda query profile of the SEND product: the generic queries, plus the SEND
 * signature of a failed downstream call (`External service <name> returned errors`).
 */
export const SEND_LAMBDA_PROFILE: LambdaQueryProfile = {
  ...DEFAULT_LAMBDA_PROFILE,
  id: 'send',
  downstreamSignatures: [/External service\s+\S+\s+returned errors/i],
};
