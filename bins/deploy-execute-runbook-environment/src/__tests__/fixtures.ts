import type { AutomaticRunbookDescriptorV1 } from '../external.js';

/** A valid automatic runbook descriptor shared by the catalog tests. */
export const RUNBOOK: AutomaticRunbookDescriptorV1 = {
  key: 'send-apigw-analysis',
  version: '1.0.0',
  name: 'SEND API Gateway analysis',
  description: 'Analyzes a SEND API Gateway alarm',
  team: 'GO',
  kind: 'APIGW',
  categories: ['DELIVERY'],
  tags: ['send'],
  alarmNames: ['send-api-errors'],
  definitionDigest: `sha256-${'a'.repeat(64)}`,
};
