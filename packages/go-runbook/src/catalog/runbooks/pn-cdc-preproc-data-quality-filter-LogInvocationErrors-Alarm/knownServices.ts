import type { lambda } from '../framework.js';

/** The runbook documents this Lambda log group; the alarm name is not the function name. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-cdc-preproc-data-quality-filter',
  logGroup: '/aws/lambda/pn-cdc-preproc-data-quality-filter',
  varPrefix: 'cdcPreprocDataQualityFilter',
};

/** Firehose and S3 are not requestId-correlatable microservice log groups. */
export const DOWNSTREAMS: ReadonlyArray<lambda.LambdaDownstream> = [];
