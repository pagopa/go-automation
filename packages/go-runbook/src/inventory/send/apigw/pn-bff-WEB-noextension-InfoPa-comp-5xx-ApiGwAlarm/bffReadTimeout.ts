import { type Condition, stepEvidenceMatches } from '../../../../engine/index.js';

/** Variable a BFF error publishes for the errors below it: `true` when it is a read timeout. */
export const BFF_READ_TIMEOUT_VAR = 'bffReadTimeout';

/** The BFF timeout towards pn-external-registries, on the row of a BFF error. */
export const BFF_READ_TIMEOUT: Condition = stepEvidenceMatches(
  'query-pn-bff',
  '^(?=[\\s\\S]*Request to GET http://[^\\s"\\\\]+/ext-registry/pa/v1/(?:user-institutions|institutions/[^/\\s"\\\\]+/products))' +
    '(?=[\\s\\S]*io\\.netty\\.handler\\.timeout\\.ReadTimeoutException\\b)',
);
