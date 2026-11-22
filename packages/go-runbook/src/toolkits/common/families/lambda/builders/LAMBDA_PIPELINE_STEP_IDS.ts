/** Ids of the steps the Lambda alarm builder wires, reserved for its pipeline. */
export const LAMBDA_PIPELINE_STEP_IDS = {
  prepare: 'prepare-lambda-section',
  errors: 'query-lambda-errors',
  invocation: 'query-lambda-invocation',
  parse: 'parse-lambda-errors',
  analyze: 'analyze-lambda-invocation',
  descend: 'descend-lambda',
} as const;
