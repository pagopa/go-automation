import { RunbookProducts } from '../../../../common/registration/RunbookProduct.js';
import type { Runbook } from '../../../../../engine/types/Runbook.js';
import { createServiceAlarmRunbook } from '../../../../common/families/service/builders/createServiceAlarmRunbook.js';
import type { ServiceAlarmConfig } from '../../../../common/families/service/types/ServiceAlarmConfig.js';
import { SEND_SERVICE_PROFILE } from '../profiles/SEND_SERVICE_PROFILE.js';

/**
 * Builds a SEND service alarm runbook: the generic service pipeline with
 * {@link SEND_SERVICE_PROFILE} (EVO-RBREORG-OPUS-01 §7.2.2, P11).
 *
 * @param config - The service alarm configuration, without the query profile
 * @returns The built runbook
 */
export function createSendServiceAlarmRunbook(config: Omit<ServiceAlarmConfig, 'queryProfile' | 'product'>): Runbook {
  return createServiceAlarmRunbook({ ...config, queryProfile: SEND_SERVICE_PROFILE, product: RunbookProducts.SEND });
}
