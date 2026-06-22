import { parseExecuteRunbookRegion } from './regions.js';

export interface ExecuteRunbookDeploymentConfig {
  readonly environment: string;
  readonly region: string;
  readonly stage: string;
  readonly watchtowerInternalUrl: string;
  readonly vpcId: string;
  readonly subnetIds: ReadonlyArray<string>;
  readonly lambdaSecurityGroupId: string;
  readonly slackIngesterRoleArn: string;
  readonly watchtowerBackendRoleArn: string;
  readonly servicePrincipalSecretArn: string;
  readonly oamSourceAccountIds: ReadonlyArray<string>;
}

/** Resolves mandatory integration inputs without local network or IAM fallbacks. */
export function loadExecuteRunbookDeploymentConfig(
  env: Readonly<Record<string, string | undefined>>,
  supportedRegions?: ReadonlySet<string>,
): ExecuteRunbookDeploymentConfig {
  const environment = required(env, 'DEPLOY_ENV');
  const region = parseExecuteRunbookRegion(required(env, 'DEPLOY_REGION'), supportedRegions);
  const watchtowerInternalUrl = required(env, 'WATCHTOWER_INTERNAL_URL');
  if (!watchtowerInternalUrl.startsWith('https://')) {
    throw new Error('WATCHTOWER_INTERNAL_URL must use TLS');
  }
  const subnetIds = required(env, 'WATCHTOWER_SUBNET_IDS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (subnetIds.length < 2) throw new Error('WATCHTOWER_SUBNET_IDS must contain at least two subnets');
  const oamSourceAccountIds = required(env, 'OAM_SOURCE_ACCOUNT_IDS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (oamSourceAccountIds.length === 0 || oamSourceAccountIds.some((accountId) => !/^\d{12}$/.test(accountId))) {
    throw new Error('OAM_SOURCE_ACCOUNT_IDS must contain AWS account ids');
  }

  return {
    environment,
    region,
    stage: `${environment}-${region}`,
    watchtowerInternalUrl,
    vpcId: required(env, 'WATCHTOWER_VPC_ID'),
    subnetIds,
    lambdaSecurityGroupId: required(env, 'WATCHTOWER_LAMBDA_SECURITY_GROUP_ID'),
    slackIngesterRoleArn: requiredArn(env, 'WATCHTOWER_SLACK_INGESTER_ROLE_ARN'),
    watchtowerBackendRoleArn: requiredArn(env, 'WATCHTOWER_BACKEND_ROLE_ARN'),
    servicePrincipalSecretArn: requiredArn(env, 'WATCHTOWER_SERVICE_PRINCIPAL_SECRET_ARN'),
    oamSourceAccountIds: [...new Set(oamSourceAccountIds)],
  };
}

function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name]?.trim();
  if (value === undefined || value === '') throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function requiredArn(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = required(env, name);
  if (!/^arn:aws:[a-z0-9-]+:[a-z0-9-]*:\d{12}:.+$/.test(value)) throw new Error(`${name} must be an AWS ARN`);
  return value;
}
