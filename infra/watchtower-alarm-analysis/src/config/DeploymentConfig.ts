import { parseExecuteRunbookRegion } from './regions.js';

export interface ExecuteRunbookDeploymentConfig {
  readonly environment: string;
  readonly region: string;
  readonly stage: string;
  readonly watchtowerInternalUrl: string;
  readonly vpcId: string;
  readonly watchtowerPrivateSubnetId: string;
  readonly watchtowerNatGatewayId: string;
  readonly workerSubnetCidrBlock: string;
  readonly workerSubnetAvailabilityZone: string;
  readonly slackIngesterRoleArn: string;
  readonly watchtowerBackendRoleArn: string;
  readonly servicePrincipalSecretArn?: string;
  readonly oamSourceAccountIds: ReadonlyArray<string>;
}

interface WatchtowerDeploymentDefaults {
  readonly watchtowerInternalUrl: string;
  readonly vpcId: string;
  readonly watchtowerPrivateSubnetId: string;
  readonly watchtowerNatGatewayId: string;
  readonly workerSubnetCidrBlock: string;
  readonly workerSubnetAvailabilityZone: string;
  readonly slackIngesterRoleArn: string;
  readonly watchtowerBackendRoleArn: string;
  readonly oamSourceAccountIds: ReadonlyArray<string>;
}

const WATCHTOWER_PRODUCTION_EU_SOUTH_1_DEFAULTS: WatchtowerDeploymentDefaults = {
  watchtowerInternalUrl: 'https://d2xwbj6sp8axq2.cloudfront.net/bff',
  vpcId: 'vpc-043f4b7213d4ca900',
  watchtowerPrivateSubnetId: 'subnet-079dcb5ef09865dc2',
  watchtowerNatGatewayId: 'nat-0b886fee7edcdc400',
  workerSubnetCidrBlock: '172.31.65.0/24',
  workerSubnetAvailabilityZone: 'eu-south-1b',
  slackIngesterRoleArn: 'arn:aws:iam::170533023216:role/service-role/go-watchtower-slack-ingestor-role-w5can32v',
  watchtowerBackendRoleArn: 'arn:aws:iam::170533023216:role/pn-dept-insights-ssm-role',
  oamSourceAccountIds: ['170533023216'],
};

/** Resolves integration inputs, defaulting known Watchtower production topology from inventory. */
export function loadExecuteRunbookDeploymentConfig(
  env: Readonly<Record<string, string | undefined>>,
  supportedRegions?: ReadonlySet<string>,
): ExecuteRunbookDeploymentConfig {
  const environment = required(env, 'DEPLOY_ENV');
  const region = parseExecuteRunbookRegion(required(env, 'DEPLOY_REGION'), supportedRegions);
  const defaults = deploymentDefaults(environment, region);
  const watchtowerInternalUrl = optional(env, 'WATCHTOWER_INTERNAL_URL', defaults?.watchtowerInternalUrl);
  if (!watchtowerInternalUrl.startsWith('https://')) {
    throw new Error('WATCHTOWER_INTERNAL_URL must use TLS');
  }
  const vpcId = optional(env, 'WATCHTOWER_VPC_ID', defaults?.vpcId);
  const watchtowerPrivateSubnetId = optional(env, 'WATCHTOWER_PRIVATE_SUBNET_ID', defaults?.watchtowerPrivateSubnetId);
  const watchtowerNatGatewayId = optional(env, 'WATCHTOWER_NAT_GATEWAY_ID', defaults?.watchtowerNatGatewayId);
  const workerSubnetCidrBlock = optional(env, 'EXECUTE_RUNBOOK_WORKER_SUBNET_CIDR', defaults?.workerSubnetCidrBlock);
  const workerSubnetAvailabilityZone = optional(
    env,
    'EXECUTE_RUNBOOK_WORKER_SUBNET_AZ',
    defaults?.workerSubnetAvailabilityZone,
  );
  const oamSourceAccountIds = optional(env, 'OAM_SOURCE_ACCOUNT_IDS', defaults?.oamSourceAccountIds.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (oamSourceAccountIds.length === 0 || oamSourceAccountIds.some((accountId) => !/^\d{12}$/.test(accountId))) {
    throw new Error('OAM_SOURCE_ACCOUNT_IDS must contain AWS account ids');
  }
  const servicePrincipalSecretArn = optionalArn(env, 'WATCHTOWER_SERVICE_PRINCIPAL_SECRET_ARN');

  return {
    environment,
    region,
    stage: `${environment}-${region}`,
    watchtowerInternalUrl,
    vpcId: validateId('WATCHTOWER_VPC_ID', vpcId, /^vpc-[a-f0-9]+$/),
    watchtowerPrivateSubnetId: validateId(
      'WATCHTOWER_PRIVATE_SUBNET_ID',
      watchtowerPrivateSubnetId,
      /^subnet-[a-f0-9]+$/,
    ),
    watchtowerNatGatewayId: validateId('WATCHTOWER_NAT_GATEWAY_ID', watchtowerNatGatewayId, /^nat-[a-f0-9]+$/),
    workerSubnetCidrBlock: validateCidr('EXECUTE_RUNBOOK_WORKER_SUBNET_CIDR', workerSubnetCidrBlock),
    workerSubnetAvailabilityZone: validateAvailabilityZone(region, workerSubnetAvailabilityZone),
    slackIngesterRoleArn: requiredArn(env, 'WATCHTOWER_SLACK_INGESTER_ROLE_ARN', defaults?.slackIngesterRoleArn),
    watchtowerBackendRoleArn: requiredArn(env, 'WATCHTOWER_BACKEND_ROLE_ARN', defaults?.watchtowerBackendRoleArn),
    ...(servicePrincipalSecretArn === undefined ? {} : { servicePrincipalSecretArn }),
    oamSourceAccountIds: [...new Set(oamSourceAccountIds)],
  };
}

function deploymentDefaults(environment: string, region: string): WatchtowerDeploymentDefaults | undefined {
  if (environment === 'production' && region === 'eu-south-1') return WATCHTOWER_PRODUCTION_EU_SOUTH_1_DEFAULTS;
  return undefined;
}

function optional(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: string | undefined,
): string {
  const value = env[name]?.trim();
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined && fallback !== '') return fallback;
  throw new Error(`Missing required environment variable ${name}`);
}

function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name]?.trim();
  if (value === undefined || value === '') throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function requiredArn(env: Readonly<Record<string, string | undefined>>, name: string, fallback?: string): string {
  const value = optional(env, name, fallback);
  if (!/^arn:aws:[a-z0-9-]+:[a-z0-9-]*:\d{12}:.+$/.test(value)) throw new Error(`${name} must be an AWS ARN`);
  return value;
}

function optionalArn(env: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
  const value = env[name]?.trim();
  if (value === undefined || value === '') return undefined;
  if (!/^arn:aws:[a-z0-9-]+:[a-z0-9-]*:\d{12}:.+$/.test(value)) throw new Error(`${name} must be an AWS ARN`);
  return value;
}

function validateId(name: string, value: string, pattern: RegExp): string {
  if (!pattern.test(value)) throw new Error(`${name} has an invalid AWS id`);
  return value;
}

function validateCidr(name: string, value: string): string {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}\/(?:[0-9]|[12][0-9]|3[0-2])$/.test(value)) {
    throw new Error(`${name} must be an IPv4 CIDR block`);
  }
  return value;
}

function validateAvailabilityZone(region: string, value: string): string {
  if (!value.startsWith(`${region}`)) throw new Error('EXECUTE_RUNBOOK_WORKER_SUBNET_AZ must be in DEPLOY_REGION');
  return value;
}
