import { defineInteropK8sAlarm, type InteropK8sAlarm } from '../interop/defineInteropK8sAlarm.js';

export const PUBLIC_CATALOG_STRAPI_ALARM: InteropK8sAlarm = defineInteropK8sAlarm({
  runbookKey: 'k8s-interop-public-catalog-strapi-errors',
  podApp: 'interop-public-catalog-strapi',
  varPrefix: 'interopPublicCatalogStrapi',
  alarmName: (key, environment) => `${key}-${environment}-public-catalog`,
});
