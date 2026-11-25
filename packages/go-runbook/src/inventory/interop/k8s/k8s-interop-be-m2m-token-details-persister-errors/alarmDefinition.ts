import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-m2m-token-details-persister` INTEROP k8s alarm in every environment. */
export const M2M_TOKEN_DETAILS_PERSISTER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-m2m-token-details-persister-errors',
  podApp: 'interop-be-m2m-token-details-persister',
  varPrefix: 'interopM2mTokenDetailsPersister',
});
