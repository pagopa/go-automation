import { parseExecuteRunbookRegion } from './regions.js';

export interface ExecuteRunbookSourceLinkDeploymentConfig {
  readonly environment: string;
  readonly region: string;
  readonly stage: string;
  readonly sinkArn: string;
  readonly labelTemplate: string;
  readonly logGroupFilter: string;
}

/** Resolves the source-account OAM Link inputs without monitoring-account defaults. */
export function loadExecuteRunbookSourceLinkDeploymentConfig(
  env: Readonly<Record<string, string | undefined>>,
  supportedRegions?: ReadonlySet<string>,
): ExecuteRunbookSourceLinkDeploymentConfig {
  const environment = required(env, 'DEPLOY_ENV');
  const region = parseExecuteRunbookRegion(required(env, 'DEPLOY_REGION'), supportedRegions);
  const sinkArn = required(env, 'OAM_SINK_ARN');
  if (!/^arn:aws:oam:[a-z0-9-]+:\d{12}:sink\/[A-Za-z0-9-]+$/.test(sinkArn)) {
    throw new Error('OAM_SINK_ARN must be an OAM sink ARN');
  }
  const labelTemplate = required(env, 'OAM_LINK_LABEL_TEMPLATE');
  const logGroupFilter = required(env, 'OAM_LOG_GROUP_FILTER');
  if (!logGroupFilter.includes('LogGroupName') || logGroupFilter.length > 2_000) {
    throw new Error('OAM_LOG_GROUP_FILTER must be a bounded CloudWatch LogGroupName filter');
  }
  return {
    environment,
    region,
    stage: `${environment}-${region}`,
    sinkArn,
    labelTemplate,
    logGroupFilter,
  };
}

function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name]?.trim();
  if (value === undefined || value === '') throw new Error(`Missing required environment variable ${name}`);
  return value;
}
