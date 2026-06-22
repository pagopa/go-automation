import type { paths } from './generated/openapi.js';

export type HumanLoginRequest = paths['/auth/login']['post']['requestBody']['content']['application/json'];
export type HumanLoginResponse = paths['/auth/login']['post']['responses'][200]['content']['application/json'];
export type ServiceLoginRequest = paths['/auth/service/login']['post']['requestBody']['content']['application/json'];
export type ServiceLoginResponse =
  paths['/auth/service/login']['post']['responses'][200]['content']['application/json'];
export type RefreshTokenRequest = paths['/auth/refresh']['post']['requestBody']['content']['application/json'];
export type RefreshTokenResponse = paths['/auth/refresh']['post']['responses'][200]['content']['application/json'];

export type ProductDto = paths['/api/products']['get']['responses'][200]['content']['application/json'][number];
export type AlarmDto =
  paths['/api/products/{productId}/alarms']['get']['responses'][200]['content']['application/json'][number];
export type EnvironmentDto =
  paths['/api/products/{productId}/environments']['get']['responses'][200]['content']['application/json'][number];
export type AlarmEventsQuery = NonNullable<paths['/api/alarm-events']['get']['parameters']['query']>;
export type AlarmEventsPage = paths['/api/alarm-events']['get']['responses'][200]['content']['application/json'];
export type AlarmEventDto = AlarmEventsPage['data'][number];
export type AlarmEventDetailDto =
  paths['/api/alarm-events/{id}']['get']['responses'][200]['content']['application/json'];
export type AlarmAnalysisDto =
  paths['/api/products/{productId}/analyses/{id}']['get']['responses'][200]['content']['application/json'];

export type AutomaticRunbookExecutionsQuery = NonNullable<
  paths['/api/automatic-runbook-executions']['get']['parameters']['query']
>;
export type AutomaticRunbookExecutionsPage =
  paths['/api/automatic-runbook-executions']['get']['responses'][200]['content']['application/json'];
export type AutomaticRunbookExecutionDto =
  paths['/api/automatic-runbook-executions/{id}']['get']['responses'][200]['content']['application/json'];
export type AutomaticRunbookExecutionStatus = AutomaticRunbookExecutionDto['status'];
export type AutomaticRunbookAttemptsResponse =
  paths['/api/automatic-runbook-executions/{id}/attempts']['get']['responses'][200]['content']['application/json'];

export type StartExecutionRequest =
  paths['/api/automatic-runbook-executions/{id}/start']['post']['requestBody']['content']['application/json'];
export type StartExecutionResponse =
  paths['/api/automatic-runbook-executions/{id}/start']['post']['responses'][200]['content']['application/json'];
export type ProgressExecutionRequest =
  paths['/api/automatic-runbook-executions/{id}/progress']['patch']['requestBody']['content']['application/json'];
export type ProgressExecutionResponse =
  paths['/api/automatic-runbook-executions/{id}/progress']['patch']['responses'][200]['content']['application/json'];
export type CompleteExecutionRequest =
  paths['/api/automatic-runbook-executions/{id}/complete']['post']['requestBody']['content']['application/json'];
export type AutomaticRunbookOutcome = CompleteExecutionRequest['outcome'];
export type CompleteExecutionTracking = NonNullable<CompleteExecutionRequest['tracking']>;
export type CompleteExecutionTrackingEntry = CompleteExecutionTracking[number];
export type TrackingIdentifierType = CompleteExecutionTrackingEntry['identifierType'];
export type CompleteExecutionResponse =
  paths['/api/automatic-runbook-executions/{id}/complete']['post']['responses'][200]['content']['application/json'];
export type CompleteExecutionConflict =
  paths['/api/automatic-runbook-executions/{id}/complete']['post']['responses'][409]['content']['application/json'];
export type FailExecutionRequest =
  paths['/api/automatic-runbook-executions/{id}/fail']['post']['requestBody']['content']['application/json'];
export type FailExecutionResponse =
  paths['/api/automatic-runbook-executions/{id}/fail']['post']['responses'][200]['content']['application/json'];
export type FailExecutionConflict =
  paths['/api/automatic-runbook-executions/{id}/fail']['post']['responses'][409]['content']['application/json'];
export type AcknowledgeCancellationRequest =
  paths['/api/automatic-runbook-executions/{id}/cancel/ack']['post']['requestBody']['content']['application/json'];
export type AcknowledgeCancellationResponse =
  paths['/api/automatic-runbook-executions/{id}/cancel/ack']['post']['responses'][200]['content']['application/json'];
export type AcknowledgeCancellationConflict =
  paths['/api/automatic-runbook-executions/{id}/cancel/ack']['post']['responses'][409]['content']['application/json'];
export type CancelExecutionRequest =
  paths['/api/automatic-runbook-executions/{id}/cancel']['post']['requestBody']['content']['application/json'];
export type CancelExecutionResponse =
  paths['/api/automatic-runbook-executions/{id}/cancel']['post']['responses'][200]['content']['application/json'];
export type CancelExecutionConflict =
  paths['/api/automatic-runbook-executions/{id}/cancel']['post']['responses'][409]['content']['application/json'];

export type CompleteExecutionResult = CompleteExecutionResponse | CompleteExecutionConflict;
export type FailExecutionResult = FailExecutionResponse | FailExecutionConflict;
export type AcknowledgeCancellationResult = AcknowledgeCancellationResponse | AcknowledgeCancellationConflict;
export type CancelExecutionResult = CancelExecutionResponse | CancelExecutionConflict;
