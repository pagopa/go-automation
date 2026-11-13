import type { lambda } from '../../../../toolkits/send/index.js';

export const LAMBDA_FUNCTION: lambda.LambdaFunction = {
  name: 'Lambda-DailyExport-DynamoDbTable',
  logGroup: '/aws/lambda/Lambda-DailyExport-DynamoDbTable',
  varPrefix: 'dailyExport',
};
