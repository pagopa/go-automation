import type { ExtractFallbackUuidFn } from '../../../parsing/applicationLogs/ExtractFallbackUuidFn.js';
import type { ServiceLogSchema } from '../../../parsing/applicationLogs/ServiceLogSchema.js';

export interface ServiceErrorRootConfig {
  readonly stepId: string;
  readonly varPrefix: string;
  readonly schema: ServiceLogSchema;
  readonly extractFallbackUuid?: ExtractFallbackUuidFn;
}
