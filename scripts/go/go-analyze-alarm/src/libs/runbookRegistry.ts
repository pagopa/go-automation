/** Typed automatic-runbook registry shared by CLI, worker and catalog generator. */
import { createHash } from 'node:crypto';

import {
  canonicalizeJson,
  type AutomaticRunbookDescriptorV1,
  type AutomaticRunbookKind,
} from '@go-automation/go-execute-runbook-contracts';
import { assertCloudExecutableRunbook } from '@go-automation/go-runbook';
import type { Runbook } from '@go-automation/go-runbook';

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

// service logs
import { buildWorkdayPnExternalChannelAlbAlarmRunbook } from './runbooks/workday-pn-external-channel-alb-alarm/runbook.js';

export type RunbookBuilderFn = () => Runbook;

export interface AutomaticRunbookRegistration {
  readonly alarmNames: readonly [string, ...string[]];
  readonly kind: AutomaticRunbookKind;
  readonly categories: readonly [string, ...string[]];
  readonly build: RunbookBuilderFn;
}

export interface ResolvedAutomaticRunbook {
  readonly descriptor: AutomaticRunbookDescriptorV1;
  readonly build: RunbookBuilderFn;
}

export class AutomaticRunbookRegistry {
  private readonly byKey = new Map<string, ResolvedAutomaticRunbook>();
  private readonly byAlarmName = new Map<string, ResolvedAutomaticRunbook>();
  private readonly descriptors: ReadonlyArray<AutomaticRunbookDescriptorV1>;

  constructor(registrations: ReadonlyArray<AutomaticRunbookRegistration>) {
    for (const registration of registrations) {
      const descriptor = descriptorFrom(registration);
      const resolved = { descriptor, build: registration.build };
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
      assertCloudExecutableRunbook(resolved.build());
      const rebuilt = descriptorFrom({
        alarmNames: resolved.descriptor.alarmNames,
        kind: resolved.descriptor.kind,
        categories: resolved.descriptor.categories as readonly [string, ...string[]],
        build: resolved.build,
      });
      if (canonicalizeJson(rebuilt) !== canonicalizeJson(resolved.descriptor)) {
        throw new Error(`Automatic runbook metadata or digest is unstable: ${resolved.descriptor.key}`);
      }
    }
  }
}

const REGISTRATIONS: ReadonlyArray<AutomaticRunbookRegistration> = [
  registration('APIGW', ['DELIVERY'], buildAddressBookIoApiGwAlarmRunbook),
  registration('APIGW', ['DELIVERY'], buildDeliveryB2BApiGwAlarmRunbook),
  registration('APIGW', ['DELIVERY'], buildDeliveryIoExpApiGwAlarmRunbook),
  registration('APIGW', ['DELIVERY'], buildDeliveryPushB2BApiGwAlarmRunbook),
  registration('APIGW', ['INTEGRATION'], buildNationalRegistriesPNPGApiGwAlarmRunbook),
  registration('LAMBDA', ['AUTHORIZATION'], buildIoAuthorizerLambdaRunbook),
  registration('LAMBDA', ['AUTHORIZATION', 'INTEGRATION'], buildTokenExchangeLambdaRunbook),
  registration('LAMBDA', ['DELIVERY'], buildSlaViolationCheckerLambdaSqsRunbook),
  registration('LAMBDA', ['AUTHORIZATION'], buildApiKeyAuthorizerV2LambdaLogInvocationErrorsAlarmRunbook),
  registration('LAMBDA', ['AUTHORIZATION'], buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook),
  registration('LAMBDA', ['DELIVERY'], buildDeliveryInsertTriggerEbLambdaLogInvocationErrorsAlarmRunbook),
  registration('SERVICE', ['DELIVERY'], buildWorkdayPnExternalChannelAlbAlarmRunbook),
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
  kind: AutomaticRunbookKind,
  categories: readonly [string, ...string[]],
  build: RunbookBuilderFn,
  alarmNames?: readonly [string, ...string[]],
): AutomaticRunbookRegistration {
  return { alarmNames: alarmNames ?? [build().metadata.id], kind, categories, build };
}

function descriptorFrom(registration: AutomaticRunbookRegistration): AutomaticRunbookDescriptorV1 {
  const runbook = registration.build();
  return {
    key: runbook.metadata.id,
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
