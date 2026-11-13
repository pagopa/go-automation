/**
 * @pagopa/go-aws/profiles — parsing of the AWS configuration: profile entries,
 * account directory and SSO permission sets.
 *
 * Pure configuration parsing, with no AWS SDK: consumers that must not load
 * `@aws-sdk/client-sts` (the root does) import it from here.
 */

export { parseAwsProfileEntries } from './parseAwsProfileEntries.js';
export type { AWSProfileEntries } from './AWSProfileEntries.js';
export { parseAwsAccountDirectory } from './parseAwsAccountDirectory.js';
export type { AWSAccountDirectoryEntry } from './AWSAccountDirectoryEntry.js';
export { permissionSetOfArn } from './permissionSetOfArn.js';
