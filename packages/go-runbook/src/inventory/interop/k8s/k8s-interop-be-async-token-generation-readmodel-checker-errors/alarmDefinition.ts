import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

export const ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-async-token-generation-readmodel-checker-errors',
  podApp: 'interop-be-async-token-generation-readmodel-checker',
  varPrefix: 'interopAsyncTokenGenerationReadmodelChecker',
  environments: ['att'],
});
