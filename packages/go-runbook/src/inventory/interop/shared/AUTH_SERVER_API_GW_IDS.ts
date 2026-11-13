import type { InteropEnvironment } from '../../../toolkits/interop/index.js';

/**
 * REST API ids of the INTEROP auth-server API Gateway in each environment,
 * shared by its 4xx and 5xx alarm runbooks (EVO-RBREORG-OPUS-01 P31).
 */
export const AUTH_SERVER_API_GW_IDS: Readonly<Record<InteropEnvironment, string>> = {
  prod: 'ffmbmcmreh',
  att: '70ar087an0',
  test: 'q9ocrukty2',
};
