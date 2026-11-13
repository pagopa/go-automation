/**
 * @pagopa/go-aws/athena — requires the peer `@aws-sdk/client-athena`.
 */

export { ATHENA_CLIENT } from './ATHENA_CLIENT.js';
export { AWSAthenaService } from './AWSAthenaService.js';
export type {
  AWSAthenaPollAttemptHandler,
  AWSAthenaQueryColumn,
  AWSAthenaQueryOptions,
  AWSAthenaQueryResult,
} from './AWSAthenaService.js';
export { AWSAthenaQueryTemplateCompiler } from './AWSAthenaQueryTemplateCompiler.js';
export type { AWSAthenaCompiledQuery, AWSAthenaQueryTemplateCompileOptions } from './AWSAthenaQueryTemplateCompiler.js';
export type { AthenaClient } from '@aws-sdk/client-athena';
