/** Typed automatic-runbook registry shared by CLI, worker and catalog generator. */
import { createHash } from 'node:crypto';

import { canonicalizeJson } from '@go-automation/go-common/core';

import type { RunbookDescriptor } from './RunbookDescriptor.js';

import { assertAnalysisAnnotations } from '../validation/assertAnalysisAnnotations.js';
import { assertCloudExecutableRunbook } from '../validation/assertCloudExecutableRunbook.js';
import type { RunbookRegistration } from './RunbookRegistration.js';
import { CATALOG_MANIFEST } from './catalogManifest.js';
import type { ResolvedRunbook } from './ResolvedRunbook.js';
import type { RunbookBuilderFn } from './RunbookBuilderFn.js';

export class RunbookCatalog {
  private readonly byKey = new Map<string, ResolvedRunbook>();
  private readonly byAlarmName = new Map<string, ResolvedRunbook>();
  private readonly descriptors: ReadonlyArray<RunbookDescriptor>;

  constructor(registrations: ReadonlyArray<RunbookRegistration>) {
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

  resolveByAlarmName(alarmName: string): ResolvedRunbook | undefined {
    return this.byAlarmName.get(alarmName);
  }

  resolveByKey(key: string): ResolvedRunbook | undefined {
    return this.byKey.get(key);
  }

  listDescriptors(): ReadonlyArray<RunbookDescriptor> {
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

export const RUNBOOK_CATALOG: RunbookCatalog = new RunbookCatalog(CATALOG_MANIFEST);

/** Compatibility map for existing local consumers; new code should use RUNBOOK_CATALOG. */
export const RUNBOOK_REGISTRY: ReadonlyMap<string, RunbookBuilderFn> = new Map(
  CATALOG_MANIFEST.flatMap((entry) => entry.alarmNames.map((alarmName) => [alarmName, entry.build] as const)),
);

/** Compatibility wrapper used by existing CI checks. */
export function validateCloudRunbookRegistry(registry: ReadonlyMap<string, RunbookBuilderFn> = RUNBOOK_REGISTRY): void {
  if (registry === RUNBOOK_REGISTRY) {
    RUNBOOK_CATALOG.validateForCloud();
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

function descriptorFrom(registration: RunbookRegistration, runbook = registration.build()): RunbookDescriptor {
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

function compareDescriptorKey(left: RunbookDescriptor, right: RunbookDescriptor): number {
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}
