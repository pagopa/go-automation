/** Typed automatic-runbook registry shared by CLI, worker and catalog generator. */
import { createHash } from 'node:crypto';

import {
  canonicalizeJson,
  type AutomaticRunbookDescriptorV1,
  type AutomaticRunbookKind,
} from '@go-automation/go-execute-runbook-contracts';

import type { Runbook } from '../types/Runbook.js';
import type { RunbookProduct } from '../types/RunbookProduct.js';
import { assertAnalysisAnnotations } from '../validation/assertAnalysisAnnotations.js';
import { assertCloudExecutableRunbook } from '../validation/assertCloudExecutableRunbook.js';

// api gateway
import { buildAddressBookIoApiGwAlarmRunbook } from './runbooks/pn-address-book-io-IO-ApiGwAlarm/runbook.js';
import { buildDeliveryB2BApiGwAlarmRunbook } from './runbooks/pn-delivery-B2B-ApiGwAlarm/runbook.js';
import { buildDeliveryIoExpApiGwAlarmRunbook } from './runbooks/pn-delivery-IO_EXP-ApiGwAlarm/runbook.js';
import { buildDeliveryPushB2BApiGwAlarmRunbook } from './runbooks/pn-delivery-push-B2B-ApiGwAlarm/runbook.js';
import { buildNationalRegistriesPNPGApiGwAlarmRunbook } from './runbooks/pn-national-registries-PNPG-ApiGwAlarm/runbook.js';

// lambda
import { buildIoAuthorizerLambdaRunbook } from './runbooks/pn-ioAuthorizerLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildTokenExchangeLambdaRunbook } from './runbooks/pn-tokenExchangeLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildSlaViolationCheckerLambdaSqsRunbook } from './runbooks/pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm/runbook.js';
import { buildApiKeyAuthorizerV2LambdaLogInvocationErrorsAlarmRunbook } from './runbooks/pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm/runbook.js';
import { buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook } from './runbooks/pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildDeliveryInsertTriggerEbLambdaLogInvocationErrorsAlarmRunbook } from './runbooks/pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm/runbook.js';
import { buildLollipopAuthorizerLambdaLogInvocationErrorsAlarmRunbook } from './runbooks/pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm/runbook.js';

// service logs
import { buildEmdDownstreamDetectionAlarmRunbook } from './runbooks/emd-downstream-detection-Alarm/runbook.js';
import { buildNationalRegistriesAnprDownstreamDetectionAlarmRunbook } from './runbooks/pn-national-registries-ANPR-downstream-detection-Alarm/runbook.js';
import { buildExternalRegistriesOneTrustDownstreamDetectionAlarmRunbook } from './runbooks/pn-external-registries-OneTrust-downstream-detection-Alarm/runbook.js';
import { buildNationalRegistriesInfoCamereDownstreamDetectionAlarmRunbook } from './runbooks/pn-national-registries-InfoCamere-downstream-detection-Alarm/runbook.js';
import { buildNationalRegistriesIpaDownstreamDetectionAlarmRunbook } from './runbooks/pn-national-registries-IPA-downstream-detection-Alarm/runbook.js';
import { buildNationalRegistriesAdeDownstreamDetectionAlarmRunbook } from './runbooks/pn-national-registries-AdE-downstream-detection-Alarm/runbook.js';
import { buildNationalRegistriesInadDownstreamDetectionAlarmRunbook } from './runbooks/pn-national-registries-INAD-downstream-detection-Alarm/runbook.js';
import { buildAddressManagerPostelDownstreamDetectionAlarmRunbook } from './runbooks/pn-address-manager-POSTEL-downstream-detection-Alarm/runbook.js';
import { buildPersonalDataVaultSelfcarePgDownstreamDetectionAlarmRunbook } from './runbooks/personal-data-vault-SelfcarePG-downstream-detection-Alarm/runbook.js';
import { buildWorkdayPnExternalChannelAlbAlarmRunbook } from './runbooks/workday-pn-external-channel-alb-alarm/runbook.js';
import { buildK8sInteropBeBackendForFrontendErrorsRunbook } from './runbooks/k8s-interop-be-backend-for-frontend-errors/runbook.js';
import {
  INTEROP_BFF_ALARM_NAMES,
  INTEROP_BFF_RUNBOOK_KEY,
} from './runbooks/k8s-interop-be-backend-for-frontend-errors/resolveInteropAlarmContext.js';
import { buildK8sInteropBeNotificationUserLifecycleConsumerErrorsRunbook } from './runbooks/k8s-interop-be-notification-user-lifecycle-consumer-errors/runbook.js';
import {
  INTEROP_NOTIFICATION_USER_LIFECYCLE_ALARM_NAMES,
  INTEROP_NOTIFICATION_USER_LIFECYCLE_RUNBOOK_KEY,
} from './runbooks/k8s-interop-be-notification-user-lifecycle-consumer-errors/resolveInteropAlarmContext.js';
import { buildK8sInteropPublicCatalogAstroFrontendErrorsRunbook } from './runbooks/k8s-interop-public-catalog-astro-frontend-errors/runbook.js';
import {
  INTEROP_PUBLIC_CATALOG_ALARM_NAMES,
  INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY,
} from './runbooks/k8s-interop-public-catalog-astro-frontend-errors/resolveInteropAlarmContext.js';
import { buildK8sInteropBeSelfcareClientUsersUpdaterErrorsRunbook } from './runbooks/k8s-interop-be-selfcare-client-users-updater-errors/runbook.js';
import {
  INTEROP_SELFCARE_USERS_UPDATER_ALARM_NAMES,
  INTEROP_SELFCARE_USERS_UPDATER_RUNBOOK_KEY,
} from './runbooks/k8s-interop-be-selfcare-client-users-updater-errors/resolveInteropAlarmContext.js';
import { buildInteropSelfcareApiGw5xxRunbook } from './runbooks/interop-selfcare-1.0-apigw-5xx/runbook.js';
import {
  INTEROP_SELFCARE_API_GW_ALARM_NAMES,
  INTEROP_SELFCARE_API_GW_RUNBOOK_KEY,
} from './runbooks/interop-selfcare-1.0-apigw-5xx/resolveInteropAlarmContext.js';

export type RunbookBuilderFn = () => Runbook;

export interface AutomaticRunbookRegistration {
  readonly key: string;
  /** Watchtower product owning the alarms; selects the downstream catalog (§5.1.2). */
  readonly product: RunbookProduct;
  readonly alarmNames: readonly [string, ...string[]];
  readonly kind: AutomaticRunbookKind;
  readonly categories: readonly [string, ...string[]];
  readonly build: RunbookBuilderFn;
}

export interface ResolvedAutomaticRunbook {
  readonly descriptor: AutomaticRunbookDescriptorV1;
  readonly product: RunbookProduct;
  readonly build: RunbookBuilderFn;
}

export class AutomaticRunbookRegistry {
  private readonly byKey = new Map<string, ResolvedAutomaticRunbook>();
  private readonly byAlarmName = new Map<string, ResolvedAutomaticRunbook>();
  private readonly descriptors: ReadonlyArray<AutomaticRunbookDescriptorV1>;

  constructor(registrations: ReadonlyArray<AutomaticRunbookRegistration>) {
    for (const registration of registrations) {
      const descriptor = descriptorFrom(registration);
      const resolved = { descriptor, product: registration.product, build: registration.build };
      if (this.byKey.has(descriptor.key)) throw new Error(`Duplicate automatic runbook key: ${descriptor.key}`);
      this.byKey.set(descriptor.key, resolved);
      for (const alarmName of descriptor.alarmNames) {
        if (this.byAlarmName.has(alarmName)) throw new Error(`Ambiguous automatic runbook alarm name: ${alarmName}`);
        this.byAlarmName.set(alarmName, resolved);
      }
    }
    this.descriptors = [...this.byKey.values()].map(({ descriptor }) => descriptor).sort(compareDescriptorKey);
  }

  resolveByAlarmName(alarmName: string): ResolvedAutomaticRunbook | undefined {
    return this.byAlarmName.get(alarmName);
  }

  resolveByKey(key: string): ResolvedAutomaticRunbook | undefined {
    return this.byKey.get(key);
  }

  listDescriptors(): ReadonlyArray<AutomaticRunbookDescriptorV1> {
    return this.descriptors;
  }

  validateForCloud(): void {
    for (const resolved of this.byKey.values()) {
      const runbook = resolved.build();
      assertCloudExecutableRunbook(runbook);
      assertAnalysisAnnotations(runbook, resolved.product);
      const rebuilt = descriptorFrom(
        {
          key: resolved.descriptor.key,
          product: resolved.product,
          alarmNames: resolved.descriptor.alarmNames,
          kind: resolved.descriptor.kind,
          categories: resolved.descriptor.categories as readonly [string, ...string[]],
          build: resolved.build,
        },
        runbook,
      );
      if (canonicalizeJson(rebuilt) !== canonicalizeJson(resolved.descriptor)) {
        throw new Error(`Automatic runbook metadata or digest is unstable: ${resolved.descriptor.key}`);
      }
    }
  }
}

const REGISTRATIONS: ReadonlyArray<AutomaticRunbookRegistration> = [
  registration('pn-address-book-io-IO-ApiGwAlarm', 'SEND', 'APIGW', ['DELIVERY'], buildAddressBookIoApiGwAlarmRunbook),
  registration('pn-delivery-B2B-ApiGwAlarm', 'SEND', 'APIGW', ['DELIVERY'], buildDeliveryB2BApiGwAlarmRunbook),
  registration('pn-delivery-IO_EXP-ApiGwAlarm', 'SEND', 'APIGW', ['DELIVERY'], buildDeliveryIoExpApiGwAlarmRunbook),
  registration('pn-delivery-push-B2B-ApiGwAlarm', 'SEND', 'APIGW', ['DELIVERY'], buildDeliveryPushB2BApiGwAlarmRunbook),
  registration(
    'pn-national-registries-PNPG-ApiGwAlarm',
    'SEND',
    'APIGW',
    ['INTEGRATION'],
    buildNationalRegistriesPNPGApiGwAlarmRunbook,
  ),
  registration(
    'pn-ioAuthorizerLambda-LogInvocationErrors-Alarm',
    'SEND',
    'LAMBDA',
    ['AUTHORIZATION'],
    buildIoAuthorizerLambdaRunbook,
  ),
  registration(
    'pn-tokenExchangeLambda-LogInvocationErrors-Alarm',
    'SEND',
    'LAMBDA',
    ['AUTHORIZATION', 'INTEGRATION'],
    buildTokenExchangeLambdaRunbook,
  ),
  registration(
    'pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm',
    'SEND',
    'LAMBDA',
    ['DELIVERY'],
    buildSlaViolationCheckerLambdaSqsRunbook,
  ),
  registration(
    'pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm',
    'SEND',
    'LAMBDA',
    ['AUTHORIZATION'],
    buildApiKeyAuthorizerV2LambdaLogInvocationErrorsAlarmRunbook,
  ),
  registration(
    'pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm',
    'SEND',
    'LAMBDA',
    ['AUTHORIZATION'],
    buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook,
  ),
  registration(
    'pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm',
    'SEND',
    'LAMBDA',
    ['DELIVERY'],
    buildDeliveryInsertTriggerEbLambdaLogInvocationErrorsAlarmRunbook,
  ),
  registration(
    'pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm',
    'SEND',
    'LAMBDA',
    ['AUTHORIZATION'],
    buildLollipopAuthorizerLambdaLogInvocationErrorsAlarmRunbook,
  ),
  registration(
    'emd-downstream-detection-Alarm',
    'SEND',
    'SERVICE',
    ['INTEGRATION'],
    buildEmdDownstreamDetectionAlarmRunbook,
  ),
  registration(
    'pn-external-registries-OneTrust-downstream-detection-Alarm',
    'SEND',
    'SERVICE',
    ['INTEGRATION'],
    buildExternalRegistriesOneTrustDownstreamDetectionAlarmRunbook,
  ),
  registration(
    'pn-national-registries-IPA-downstream-detection-Alarm',
    'SEND',
    'SERVICE',
    ['INTEGRATION'],
    buildNationalRegistriesIpaDownstreamDetectionAlarmRunbook,
  ),
  registration(
    'pn-national-registries-ANPR-downstream-detection-Alarm',
    'SEND',
    'SERVICE',
    ['INTEGRATION'],
    buildNationalRegistriesAnprDownstreamDetectionAlarmRunbook,
  ),
  registration(
    'pn-national-registries-InfoCamere-downstream-detection-Alarm',
    'SEND',
    'SERVICE',
    ['INTEGRATION'],
    buildNationalRegistriesInfoCamereDownstreamDetectionAlarmRunbook,
  ),
  registration(
    'pn-national-registries-AdE-downstream-detection-Alarm',
    'SEND',
    'SERVICE',
    ['INTEGRATION'],
    buildNationalRegistriesAdeDownstreamDetectionAlarmRunbook,
  ),
  registration(
    'pn-national-registries-INAD-downstream-detection-Alarm',
    'SEND',
    'SERVICE',
    ['INTEGRATION'],
    buildNationalRegistriesInadDownstreamDetectionAlarmRunbook,
  ),
  registration(
    'pn-address-manager-POSTEL-downstream-detection-Alarm',
    'SEND',
    'SERVICE',
    ['DELIVERY'],
    buildAddressManagerPostelDownstreamDetectionAlarmRunbook,
  ),
  registration(
    'personal-data-vault-SelfcarePG-downstream-detection-Alarm',
    'SEND',
    'SERVICE',
    ['INTEGRATION'],
    buildPersonalDataVaultSelfcarePgDownstreamDetectionAlarmRunbook,
  ),
  registration(
    'workday-pn-external-channel-alb-alarm',
    'SEND',
    'SERVICE',
    ['DELIVERY'],
    buildWorkdayPnExternalChannelAlbAlarmRunbook,
  ),
  registration(
    INTEROP_BFF_RUNBOOK_KEY,
    'INTEROP',
    'SERVICE',
    ['INTEROP'],
    buildK8sInteropBeBackendForFrontendErrorsRunbook,
    INTEROP_BFF_ALARM_NAMES,
  ),
  registration(
    INTEROP_NOTIFICATION_USER_LIFECYCLE_RUNBOOK_KEY,
    'INTEROP',
    'SERVICE',
    ['INTEROP'],
    buildK8sInteropBeNotificationUserLifecycleConsumerErrorsRunbook,
    INTEROP_NOTIFICATION_USER_LIFECYCLE_ALARM_NAMES,
  ),
  registration(
    INTEROP_PUBLIC_CATALOG_RUNBOOK_KEY,
    'INTEROP',
    'SERVICE',
    ['INTEROP'],
    buildK8sInteropPublicCatalogAstroFrontendErrorsRunbook,
    INTEROP_PUBLIC_CATALOG_ALARM_NAMES,
  ),
  registration(
    INTEROP_SELFCARE_USERS_UPDATER_RUNBOOK_KEY,
    'INTEROP',
    'SERVICE',
    ['INTEROP'],
    buildK8sInteropBeSelfcareClientUsersUpdaterErrorsRunbook,
    INTEROP_SELFCARE_USERS_UPDATER_ALARM_NAMES,
  ),
  registration(
    INTEROP_SELFCARE_API_GW_RUNBOOK_KEY,
    'INTEROP',
    'APIGW',
    ['INTEROP'],
    buildInteropSelfcareApiGw5xxRunbook,
    INTEROP_SELFCARE_API_GW_ALARM_NAMES,
  ),
];

export const AUTOMATIC_RUNBOOK_REGISTRY: AutomaticRunbookRegistry = new AutomaticRunbookRegistry(REGISTRATIONS);

/** Compatibility map for existing local consumers; new code should use AUTOMATIC_RUNBOOK_REGISTRY. */
export const RUNBOOK_REGISTRY: ReadonlyMap<string, RunbookBuilderFn> = new Map(
  REGISTRATIONS.flatMap((entry) => entry.alarmNames.map((alarmName) => [alarmName, entry.build] as const)),
);

/** Compatibility wrapper used by existing CI checks. */
export function validateCloudRunbookRegistry(registry: ReadonlyMap<string, RunbookBuilderFn> = RUNBOOK_REGISTRY): void {
  if (registry === RUNBOOK_REGISTRY) {
    AUTOMATIC_RUNBOOK_REGISTRY.validateForCloud();
    return;
  }
  for (const [alarmName, buildRunbook] of registry) {
    try {
      assertCloudExecutableRunbook(buildRunbook());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Cloud runbook registry rejected "${alarmName}": ${message}`, { cause: error });
    }
  }
}

/** Builds a registration; alarmNames defaults to the runbook key for the common one-alarm case. */
function registration(
  key: string,
  product: RunbookProduct,
  kind: AutomaticRunbookKind,
  categories: readonly [string, ...string[]],
  build: RunbookBuilderFn,
  alarmNames?: readonly [string, ...string[]],
): AutomaticRunbookRegistration {
  return { key, product, alarmNames: alarmNames ?? [key], kind, categories, build };
}

function descriptorFrom(
  registration: AutomaticRunbookRegistration,
  runbook = registration.build(),
): AutomaticRunbookDescriptorV1 {
  if (runbook.metadata.id !== registration.key) {
    throw new Error(`Automatic runbook registration key differs from metadata: ${registration.key}`);
  }
  return {
    key: registration.key,
    version: runbook.metadata.version,
    name: runbook.metadata.name,
    description: runbook.metadata.description,
    team: runbook.metadata.team,
    kind: registration.kind,
    categories: [...registration.categories].sort(),
    tags: [...runbook.metadata.tags].sort(),
    alarmNames: [...registration.alarmNames].sort() as [string, ...string[]],
    definitionDigest: `sha256-${createHash('sha256').update(canonicalizeJson(runbook), 'utf8').digest('hex')}`,
  };
}

function compareDescriptorKey(left: AutomaticRunbookDescriptorV1, right: AutomaticRunbookDescriptorV1): number {
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}
