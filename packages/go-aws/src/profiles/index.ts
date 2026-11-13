/**
 * @pagopa/go-aws/profiles — parsing of the `aws.profiles` entries.
 *
 * Pure configuration parsing, with no AWS SDK: consumers that must not load
 * `@aws-sdk/client-sts` (the root does) import it from here.
 */

export { parseAwsProfileEntries } from './parseAwsProfileEntries.js';
export type { AWSProfileEntries } from './AWSProfileEntries.js';
