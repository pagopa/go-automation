import type { StepDescriptor } from '../../types/StepDescriptor.js';
import type { ApiGwRunbookContext } from '../output/ApiGwRunbookContext.js';
import type { ApiGwQueryProfile } from '../profiles/ApiGwQueryProfile.js';
import { resolveApiGwQueryProfile } from '../profiles/resolveApiGwQueryProfile.js';
import { renderQueryTemplate } from '../profiles/render/renderQueryTemplate.js';
import { KnownUrlsRegistry } from '../registries/KnownUrlsRegistry.js';
import type { ApiGwAlarmConfig } from '../types/ApiGwAlarmConfig.js';
import type { ApiGwService } from '../types/ApiGwService.js';
import { getEffectiveExecutionLogGroup, isExecutionLogEnabled } from './executionLogEnablement.js';
import {
  validateCapabilityParity,
  validateKnownCaseStepRefs,
  validateNoStepIdCollisions,
  validatePlaceholders,
} from './validations.js';

const DEFAULT_MIN_STATUS_CODE = 500;

export interface ApiGwAlarmBuildContext {
  readonly config: ApiGwAlarmConfig;
  readonly profile: ApiGwQueryProfile;
  readonly preSteps: ReadonlyArray<StepDescriptor>;
  readonly minStatus: number;
  readonly apiGwQuery: string;
  readonly registry: KnownUrlsRegistry;
  readonly allServices: ReadonlyArray<ApiGwService>;
  readonly servicesInRunbook: ReadonlySet<string>;
  readonly executionLogEnabled: boolean;
  readonly effectiveExecutionLogGroup?: string;
  readonly runbookContext: ApiGwRunbookContext;
}

export function resolveApiGwAlarmBuildContext(config: ApiGwAlarmConfig): ApiGwAlarmBuildContext {
  const profile = resolveApiGwQueryProfile(config);

  validatePlaceholders(profile);
  validateCapabilityParity(config, profile);
  validateNoStepIdCollisions(config, profile);
  validateKnownCaseStepRefs(config, profile);

  const minStatus = config.minStatusCode ?? DEFAULT_MIN_STATUS_CODE;
  const apiGwQuery = renderQueryTemplate(profile.accessLog.query, {
    values: { '{{minStatusCode}}': String(minStatus) },
    queryId: `${profile.id}.accessLog`,
  });

  const allServices: ReadonlyArray<ApiGwService> = [config.entryService, ...(config.services ?? [])];
  assertUniqueServiceNames(allServices);

  const effectiveExecutionLogGroup = getEffectiveExecutionLogGroup(config);
  const context: ApiGwAlarmBuildContext = {
    config,
    profile,
    preSteps: config.preSteps ?? [],
    minStatus,
    apiGwQuery,
    registry: new KnownUrlsRegistry(config.knownUrls),
    allServices,
    servicesInRunbook: new Set(allServices.map((service) => service.name)),
    executionLogEnabled: isExecutionLogEnabled(config, profile),
    runbookContext: {
      kind: 'apigw',
      services: allServices,
      apiGwLogGroup: config.apiGwLogGroup,
      queryProfileId: profile.id,
    },
  };

  return effectiveExecutionLogGroup === undefined ? context : { ...context, effectiveExecutionLogGroup };
}

function assertUniqueServiceNames(services: ReadonlyArray<ApiGwService>): void {
  const seenNames = new Set<string>();
  for (const service of services) {
    if (seenNames.has(service.name)) {
      throw new Error(`Duplicate service name in API Gateway runbook config: '${service.name}'`);
    }
    seenNames.add(service.name);
  }
}
