/**
 * AWS Region - Default region constant for PagoPa services
 */

/** AWS Region costante per tutti i servizi PagoPa (Milano) */
export const AWS_REGION = 'eu-south-1' as const;

/** Type representing the AWS region */
export type AWSRegion = typeof AWS_REGION;
