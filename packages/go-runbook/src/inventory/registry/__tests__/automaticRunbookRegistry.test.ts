import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { logAction } from '../../../engine/actions/ActionFactories.js';
import type { Runbook } from '../../../engine/types/Runbook.js';
import { RunbookCatalog } from '../../../toolkits/common/registration/RunbookCatalog.js';
import { RunbookKinds } from '../../../toolkits/common/registration/RunbookKind.js';
import { RunbookProducts } from '../../../toolkits/common/registration/RunbookProduct.js';
import type { RunbookRegistration } from '../../../toolkits/common/registration/RunbookRegistration.js';
import { RUNBOOK_CATALOG, validateCloudRunbookRegistry } from '../runbookRegistry.js';
import { DOWNSTREAM_CATALOGS } from '../../validation/DOWNSTREAM_CATALOGS.js';

const CATALOG_OPTIONS = { downstreamCatalogs: DOWNSTREAM_CATALOGS };

/** Registration of a production runbook, rebuilt from its resolved descriptor. */
function registrationOf(key: string): RunbookRegistration {
  const source = RUNBOOK_CATALOG.resolveByKey(key);
  assert.ok(source, `${key} must be registered`);
  return {
    key,
    product: source.product,
    alarmNames: source.descriptor.alarmNames,
    kind: source.descriptor.kind,
    categories: source.descriptor.categories as readonly [string, ...string[]],
    build: source.build,
  };
}

/** A minimal runbook, with or without the explicit cloud policy. */
function minimalRunbook(withPolicy: boolean): Runbook {
  return {
    metadata: {
      id: 'test',
      name: 'test',
      description: 'test',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    steps: [
      {
        step: {
          id: 'read-only',
          label: 'Read only',
          kind: 'data',
          async execute() {
            await Promise.resolve();
            return { success: true };
          },
        },
      },
    ],
    knownCases: [],
    fallbackAction: logAction({ level: 'info', title: 'done' }),
    ...(withPolicy ? { cloudExecutionPolicy: { sideEffects: 'NONE' as const } } : {}),
  };
}

describe('RUNBOOK_CATALOG', () => {
  it('resolves every alarm name to the descriptor of its key and nothing else', () => {
    for (const descriptor of RUNBOOK_CATALOG.listDescriptors()) {
      const byKey = RUNBOOK_CATALOG.resolveByKey(descriptor.key);
      for (const alarmName of descriptor.alarmNames) {
        assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(alarmName), byKey, alarmName);
      }
    }
    assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName('spidhub-uat-ExternalELBAlarm'), undefined);
  });

  it('lists stable sorted descriptors and validates every cloud runbook', () => {
    const first = RUNBOOK_CATALOG.listDescriptors();
    assert.deepStrictEqual(RUNBOOK_CATALOG.listDescriptors(), first);
    assert.deepStrictEqual(
      first.map(({ key }) => key),
      first.map(({ key }) => key).sort(),
    );
    assert.ok(first.every(({ definitionDigest }) => /^sha256-[a-f0-9]{64}$/.test(definitionDigest)));
    // The default registry delegates to RUNBOOK_CATALOG.validateForCloud().
    assert.doesNotThrow(() => validateCloudRunbookRegistry());
  });

  it('rejects a custom registry entry without an explicit cloud policy', () => {
    assert.throws(
      () => validateCloudRunbookRegistry(new Map([['alarm', () => minimalRunbook(false)]])),
      /Cloud runbook registry rejected "alarm".*does not declare cloud sideEffects=NONE/u,
    );
    assert.doesNotThrow(() => validateCloudRunbookRegistry(new Map([['alarm', () => minimalRunbook(true)]])));
  });

  it('builds lazily: nothing at construction, one build per resolved descriptor, a fresh build per execution', () => {
    let buildCalls = 0;
    const source = registrationOf('pn-delivery-B2B-ApiGwAlarm');
    const registry = new RunbookCatalog(
      [
        {
          ...source,
          build: () => {
            buildCalls += 1;
            return source.build();
          },
        },
      ],
      CATALOG_OPTIONS,
    );

    assert.strictEqual(buildCalls, 0, 'the constructor indexes registrations only');
    const resolved = registry.resolveByKey(source.key);
    assert.ok(resolved);
    assert.strictEqual(buildCalls, 1, 'resolution builds only the resolved runbook, for its descriptor');
    assert.strictEqual(registry.resolveByAlarmName(source.alarmNames[0]), resolved);
    assert.strictEqual(buildCalls, 1, 'the descriptor is memoized in the instance');
    assert.notStrictEqual(resolved.build(), resolved.build(), 'every execution gets a fresh runbook');
    assert.strictEqual(buildCalls, 3);
    assert.deepStrictEqual(registry.listDescriptors(), [resolved.descriptor]);
    assert.strictEqual(buildCalls, 3, 'listDescriptors reuses the memoized descriptors');
    registry.validateForCloud();
    assert.strictEqual(buildCalls, 4, 'validateForCloud builds every runbook again');
  });

  it('resolves complete descriptors on a cold catalog, identical to the listed ones', () => {
    const cold = new RunbookCatalog(
      ['pn-delivery-B2B-ApiGwAlarm', 'k8s-interop-be-notifier-errors'].map(registrationOf),
      CATALOG_OPTIONS,
    );

    const resolved = cold.resolveByKey('k8s-interop-be-notifier-errors');
    assert.ok(resolved);
    assert.match(resolved.descriptor.definitionDigest, /^sha256-[0-9a-f]{64}$/u);
    assert.ok(resolved.descriptor.version.length > 0);
    const listed = cold.listDescriptors().find((descriptor) => descriptor.key === 'k8s-interop-be-notifier-errors');
    assert.deepStrictEqual(listed, resolved.descriptor);
  });

  it('rejects duplicate keys and ambiguous alarm names at construction, without building', () => {
    const registration: RunbookRegistration = {
      key: 'dup',
      product: RunbookProducts.SEND,
      alarmNames: ['alarm-a'],
      kind: RunbookKinds.SERVICE,
      categories: ['DELIVERY'],
      build: (): never => {
        throw new Error('must not build');
      },
    };
    assert.throws(
      () => new RunbookCatalog([registration, registration], CATALOG_OPTIONS),
      /Duplicate automatic runbook key: dup/u,
    );
    assert.throws(
      () => new RunbookCatalog([registration, { ...registration, key: 'other' }], CATALOG_OPTIONS),
      /Ambiguous automatic runbook alarm name: alarm-a/u,
    );
  });
});
