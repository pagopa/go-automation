/**
 * Tells whether an error of the timeline query means that the AWS
 * credentials expired or are no longer valid.
 */
export type CredentialErrorPredicate = (error: unknown) => boolean;
