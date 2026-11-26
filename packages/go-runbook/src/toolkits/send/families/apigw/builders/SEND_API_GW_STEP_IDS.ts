/** Ids of the steps the SEND API Gateway alarm builder wires, reserved for its pipeline. */
export const SEND_API_GW_STEP_IDS = {
  prepare: 'prepare-api-gw-section',
  accessLog: 'query-api-gw-logs',
  executionLog: 'query-api-gw-execution-logs',
  parse: 'parse-api-gw-errors',
  authorizerFailure: 'evaluate-api-gw-authorizer-failure',
  stopExecutionLog: 'stop-api-gw-execution-log-unresolved',
  descend: 'descend-api-gateway',
} as const;
