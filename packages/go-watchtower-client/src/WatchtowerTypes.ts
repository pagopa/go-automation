import type { paths } from './generated/openapi.js';

export type HumanLoginRequest = paths['/auth/login']['post']['requestBody']['content']['application/json'];
export type HumanLoginResponse = paths['/auth/login']['post']['responses'][200]['content']['application/json'];
export type ServiceLoginRequest = paths['/auth/service/login']['post']['requestBody']['content']['application/json'];
export type ServiceLoginResponse =
  paths['/auth/service/login']['post']['responses'][200]['content']['application/json'];
export type CliLoginRequest = paths['/auth/cli-login']['post']['requestBody']['content']['application/json'];
export type CliLoginResponse = paths['/auth/cli-login']['post']['responses'][200]['content']['application/json'];
export type RefreshTokenRequest = paths['/auth/refresh']['post']['requestBody']['content']['application/json'];
export type RefreshTokenResponse = paths['/auth/refresh']['post']['responses'][200]['content']['application/json'];

export type ProductDto = paths['/api/products']['get']['responses'][200]['content']['application/json'][number];
export type AlarmDto =
  paths['/api/products/{productId}/alarms']['get']['responses'][200]['content']['application/json'][number];
export type EnvironmentDto =
  paths['/api/products/{productId}/environments']['get']['responses'][200]['content']['application/json'][number];
export type ResourceDto =
  paths['/api/products/{productId}/resources']['get']['responses'][200]['content']['application/json'][number];
export type DownstreamDto =
  paths['/api/products/{productId}/downstreams']['get']['responses'][200]['content']['application/json'][number];
export type FinalActionDto =
  paths['/api/products/{productId}/final-actions']['get']['responses'][200]['content']['application/json'][number];
export type RunbookDto =
  paths['/api/products/{productId}/runbooks']['get']['responses'][200]['content']['application/json'][number];
export type IgnoreReasonDto =
  paths['/api/ignore-reasons']['get']['responses'][200]['content']['application/json'][number];
export type AlarmEventsQuery = NonNullable<paths['/api/alarm-events']['get']['parameters']['query']>;
export type AlarmEventsPage = paths['/api/alarm-events']['get']['responses'][200]['content']['application/json'];
export type AlarmEventDto = AlarmEventsPage['data'][number];
export type AlarmEventDetailDto =
  paths['/api/alarm-events/{id}']['get']['responses'][200]['content']['application/json'];
export type AlarmAnalysisDto =
  paths['/api/products/{productId}/analyses/{id}']['get']['responses'][200]['content']['application/json'];

export type ShadowReportQuery = paths['/api/automatic-runbook-executions/shadow-report']['get']['parameters']['query'];
export type ShadowReportResponse =
  paths['/api/automatic-runbook-executions/shadow-report']['get']['responses'][200]['content']['application/json'];
export type ShadowCapabilityReport = ShadowReportResponse['capabilities'][number];
