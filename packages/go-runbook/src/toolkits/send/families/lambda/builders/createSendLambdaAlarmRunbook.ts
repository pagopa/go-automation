import { RunbookProducts } from '../../../../common/registration/RunbookProduct.js';
import type { Runbook } from '../../../../../engine/types/Runbook.js';
import { createLambdaAlarmRunbook } from '../../../../common/families/lambda/builders/createLambdaAlarmRunbook.js';
import type { LambdaAlarmConfig } from '../../../../common/families/lambda/types/LambdaAlarmConfig.js';
import { SEND_LAMBDA_PROFILE } from '../profiles/SEND_LAMBDA_PROFILE.js';

/**
 * Builds a SEND Lambda alarm runbook: the generic Lambda pipeline with
 * {@link SEND_LAMBDA_PROFILE} (EVO-RBREORG-OPUS-01 §7.2.2, P11).
 *
 * @param config - The Lambda alarm configuration, without the query profile
 * @returns The built runbook
 */
export function createSendLambdaAlarmRunbook(config: Omit<LambdaAlarmConfig, 'queryProfile' | 'product'>): Runbook {
  return createLambdaAlarmRunbook({ ...config, queryProfile: SEND_LAMBDA_PROFILE, product: RunbookProducts.SEND });
}
