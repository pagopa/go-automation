import { downstreamMarkerPattern } from '../../../../toolkits/send/index.js';
import {
  all,
  any,
  anyStepEvidenceMatches,
  type Condition,
  stepEvidenceMatches,
  type TreeExclusion,
} from '../../../../engine/index.js';

/** The read of pn-external-registries. */
const STEP = 'query-pn-external-registries';
/** The other error rows of the same identifier, beside the row of a node. */
const SIBLINGS = `${STEP}.siblings`;

const SELFCARE_TIMEOUT = `${downstreamMarkerPattern('SelfcarePG')}[\\s\\S]*io\\.netty\\.handler\\.timeout\\.ReadTimeoutException`;
const USER_GROUPS_REQUEST = 'Request to GET https://api\\.selfcare\\.pagopa\\.it/external/v2/user-groups';
const READ_TIMEOUT_CAUSE = 'Caused by: io\\.netty\\.handler\\.timeout\\.ReadTimeoutException';
const RETRY = 'Exception caught by retry';
const GROUPS_TIMEOUT = 'ResourceAccessException:[\\s\\S]*ext-registry-private/pa/v1/groups-all[\\s\\S]*Read timed out';
const CONNECTION_ABORTED =
  'reactor\\.netty\\.channel\\.AbortedException: Connection has been closed BEFORE send operation';

/**
 * Selfcare read timeout of an error of pn-external-registries: the DOWNSTREAM signature, or the read timeout of the
 * error with the Selfcare user-groups request in the error itself or in another error of the same request.
 */
export const EXTERNAL_REGISTRIES_SELFCARE_READ_TIMEOUT: Condition = any(
  stepEvidenceMatches(STEP, SELFCARE_TIMEOUT),
  all(stepEvidenceMatches(STEP, READ_TIMEOUT_CAUSE), anyStepEvidenceMatches([STEP, SIBLINGS], USER_GROUPS_REQUEST)),
);

/** Timeout of the groups read of an error of pn-external-registries, retried in the error or in another one. */
export const EXTERNAL_REGISTRIES_SELFCARE_RETRY_TIMEOUT: Condition = all(
  stepEvidenceMatches(STEP, GROUPS_TIMEOUT),
  anyStepEvidenceMatches([STEP, SIBLINGS], RETRY),
);

/** Connection of an error of pn-external-registries closed before the request was sent. */
export const EXTERNAL_REGISTRIES_CONNECTION_ABORTED: Condition = stepEvidenceMatches(STEP, CONNECTION_ABORTED);

/**
 * The diagnoses more specific than a pn-delivery timeout towards pn-external-registries, looked for in the whole
 * read of pn-external-registries for that pn-delivery error: published on it as
 * `externalRegistriesExclusion.specificDiagnosis` (`present`, `absent`, `unknown`).
 */
export const EXTERNAL_REGISTRIES_EXCLUSIONS: ReadonlyArray<TreeExclusion> = [
  {
    name: 'specificDiagnosis',
    condition: any(
      stepEvidenceMatches(STEP, SELFCARE_TIMEOUT),
      all(stepEvidenceMatches(STEP, USER_GROUPS_REQUEST), stepEvidenceMatches(STEP, READ_TIMEOUT_CAUSE)),
      all(stepEvidenceMatches(STEP, RETRY), stepEvidenceMatches(STEP, GROUPS_TIMEOUT)),
      stepEvidenceMatches(STEP, CONNECTION_ABORTED),
    ),
  },
];
