import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../../../../toolkits/interop/index.js';

/** The `interop-be-notification-config-readmodel-writer-sql` INTEROP k8s alarm in every environment. */
export const NOTIFICATION_CONFIG_READMODEL_WRITER_SQL_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-be-notification-config-readmodel-writer-sql-errors',
  podApp: 'interop-be-notification-config-readmodel-writer-sql',
  varPrefix: 'interopNotificationConfigReadmodelWriterSql',
});
