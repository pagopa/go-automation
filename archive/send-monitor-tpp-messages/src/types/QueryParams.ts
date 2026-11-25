/**
 * Parameters used to substitute placeholders in Athena query templates
 */
export interface QueryParams {
  readonly [key: string]: string;
}
