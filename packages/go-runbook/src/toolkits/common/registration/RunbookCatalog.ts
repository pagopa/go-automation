/** Typed automatic-runbook registry shared by CLI, worker and catalog generator. */
import { createHash } from 'node:crypto';

import { canonicalizeJson } from '@pagopa/go-common/json';

import type { KnownError, Runbook } from '../../../engine/index.js';
import type { BuiltRegistration } from './BuiltRegistration.js';
import type { KnownErrorDescriptor } from './KnownErrorDescriptor.js';
import type { RunbookDescriptor } from './RunbookDescriptor.js';

import { assertAnalysisAnnotations } from '../analysis/validation/assertAnalysisAnnotations.js';
import { assertCloudExecutableRunbook } from '../policies/assertCloudExecutableRunbook.js';
import { assertKnownErrorCodes } from './assertKnownErrorCodes.js';
import type { RunbookRegistration } from './RunbookRegistration.js';
import type { ResolvedRunbook } from './ResolvedRunbook.js';
import type { RunbookCatalogOptions } from './RunbookCatalogOptions.js';

/**
 * Registry of the automatic runbooks of an inventory.
 *
 * Built lazily: the constructor indexes only the
 * registrations (keys and alarm names are static data, so collisions fail
 * immediately and globally). A runbook is built and hashed only when it is
 * resolved, and its descriptor is memoized in this instance; `build()` still
 * returns a fresh runbook on every call. `listDescriptors()` builds every
 * runbook once and memoizes the list; `validateForCloud()` builds and checks
 * everything, as before.
 *
 * The validation is internal and cannot be skipped: the only input it takes
 * from the inventory is the downstream catalog of each product, a mandatory
 * option.
 */
export class RunbookCatalog {
  private readonly registrationsByKey = new Map<string, RunbookRegistration>();
  private readonly keyByAlarmName = new Map<string, string>();
  private readonly resolvedByKey = new Map<string, ResolvedRunbook>();
  private descriptors: ReadonlyArray<RunbookDescriptor> | undefined;

  constructor(
    registrations: ReadonlyArray<RunbookRegistration>,
    private readonly options: RunbookCatalogOptions,
  ) {
    for (const registration of registrations) {
      if (this.registrationsByKey.has(registration.key)) {
        throw new Error(`Duplicate automatic runbook key: ${registration.key}`);
      }
      this.registrationsByKey.set(registration.key, registration);
      for (const alarmName of registration.alarmNames) {
        if (this.keyByAlarmName.has(alarmName)) throw new Error(`Ambiguous automatic runbook alarm name: ${alarmName}`);
        this.keyByAlarmName.set(alarmName, registration.key);
      }
    }
  }

  /**
   * Resolves the runbook registered for an alarm, building only that runbook.
   *
   * @param alarmName - CloudWatch alarm name
   * @returns The resolved runbook with its complete descriptor, or `undefined`
   */
  resolveByAlarmName(alarmName: string): ResolvedRunbook | undefined {
    const key = this.keyByAlarmName.get(alarmName);
    return key === undefined ? undefined : this.resolveByKey(key);
  }

  /**
   * Resolves a runbook by key, building only that runbook the first time.
   *
   * @param key - Runbook key
   * @returns The resolved runbook with its complete descriptor, or `undefined`
   */
  resolveByKey(key: string): ResolvedRunbook | undefined {
    const cached = this.resolvedByKey.get(key);
    if (cached !== undefined) return cached;
    const registration = this.registrationsByKey.get(key);
    return registration === undefined ? undefined : this.resolve(registration, registration.build());
  }

  /**
   * Descriptors of every registered runbook, sorted by key. The first call
   * builds every runbook and checks the codes of their known errors across the
   * catalog; the list is then memoized in this instance.
   *
   * @returns The sorted descriptors
   * @throws Error when a code is out of form, too long or given to two different known errors
   */
  listDescriptors(): ReadonlyArray<RunbookDescriptor> {
    if (this.descriptors === undefined) {
      // One build per runbook serves both the code check and the descriptor of a runbook not resolved yet.
      const built = [...this.registrationsByKey.values()].map((registration) => {
        const runbook = registration.build();
        return { runbook, resolved: this.resolvedByKey.get(registration.key) ?? this.resolve(registration, runbook) };
      });
      assertKnownErrorCodes(
        built.map(({ runbook, resolved }) => ({ runbook, product: resolved.product, kind: resolved.descriptor.kind })),
      );
      this.descriptors = built.map(({ resolved }) => resolved.descriptor).sort(compareDescriptorKey);
    }
    return this.descriptors;
  }

  /**
   * Builds and validates every runbook for cloud execution, and the codes of their known errors across the catalog;
   * throws on the first violation.
   */
  validateForCloud(): void {
    const registrations: BuiltRegistration[] = [];
    for (const key of this.registrationsByKey.keys()) {
      const resolved = this.resolveRegistered(key);
      const runbook = resolved.build();
      registrations.push({ runbook, product: resolved.product, kind: resolved.descriptor.kind });
      assertCloudExecutableRunbook(runbook);
      assertAnalysisAnnotations(runbook, resolved.product, this.options.downstreamCatalogs[resolved.product]);
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
    assertKnownErrorCodes(registrations);
  }

  /** Resolves a registration from a runbook just built from it, and memoizes the result. */
  private resolve(registration: RunbookRegistration, runbook: Runbook): ResolvedRunbook {
    const resolved: ResolvedRunbook = {
      descriptor: descriptorFrom(registration, runbook),
      product: registration.product,
      build: registration.build,
    };
    this.resolvedByKey.set(registration.key, resolved);
    return resolved;
  }

  private resolveRegistered(key: string): ResolvedRunbook {
    const resolved = this.resolveByKey(key);
    if (resolved === undefined) throw new Error(`Automatic runbook not registered: ${key}`);
    return resolved;
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
    product: registration.product,
    kind: registration.kind,
    categories: [...registration.categories].sort(),
    tags: [...runbook.metadata.tags].sort(),
    alarmNames: [...registration.alarmNames].sort() as [string, ...string[]],
    knownErrors: runbook.knownErrors.map(knownErrorDescriptorOf),
    definitionDigest: `sha256-${createHash('sha256').update(canonicalizeJson(runbook), 'utf8').digest('hex')}`,
  };
}

/** A console title that interpolates the occurrence, as `Timeout Lambda {{vars.lambdaFunctionName}}`. */
const TEMPLATE_PLACEHOLDER = '{{';

/**
 * What the catalog publishes of a known error: the title its console row shows, or its description when that title
 * interpolates the occurrence, and its analysis when declared.
 */
function knownErrorDescriptorOf(knownError: KnownError): KnownErrorDescriptor {
  const { action, analysis } = knownError;
  return {
    code: knownError.code,
    title:
      action.type === 'log' && !action.title.includes(TEMPLATE_PLACEHOLDER) ? action.title : knownError.description,
    description: knownError.description,
    ...(analysis === undefined ? {} : { resolution: analysis.resolution, analysisType: analysis.analysisType }),
  };
}

function compareDescriptorKey(left: RunbookDescriptor, right: RunbookDescriptor): number {
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}
