import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-producer-keychain-platformstate-writer` INTEROP k8s alarm in every environment. */
export const PRODUCER_KEYCHAIN_PLATFORMSTATE_WRITER_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-producer-keychain-platformstate-writer-errors',
  podApp: 'interop-be-producer-keychain-platformstate-writer',
  varPrefix: 'interopProducerKeychainPlatformstateWriter',
});
