import type { lambda } from '../framework.js';

/**
 * DataLake failures are emitted directly by the Lambda while reading S3. No
 * downstream log group or requestId propagation is documented, therefore the
 * signatures are handled as known cases rather than routing rules.
 */
export const DOWNSTREAM_ERROR_PATTERNS: ReadonlyArray<lambda.DownstreamErrorPattern> = [];
