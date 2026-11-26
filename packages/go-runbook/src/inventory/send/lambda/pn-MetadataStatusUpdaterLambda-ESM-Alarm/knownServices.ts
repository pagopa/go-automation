import type { lambda } from '../../../../toolkits/send/index.js';

/** Lambda fed by the Kinesis event source mapping of the alarm. */
export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'pn-delivery-metadata-status-updater-lambda',
  logGroup: '/aws/lambda/pn-delivery-metadata-status-updater-lambda',
  varPrefix: 'metadataStatusUpdater',
};

/** The runbook involves only the Lambda: no downstream log query is declared. */
export const DOWNSTREAMS: ReadonlyArray<lambda.LambdaDownstream> = [];
