import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AUTOMATIC_RUNBOOK_REGISTRY, AutomaticRunbookRegistry } from '../runbookRegistry.js';

describe('AUTOMATIC_RUNBOOK_REGISTRY', () => {
  it('resolves the same descriptor by alarm name and by stable key', () => {
    const byAlarm = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName('pn-delivery-B2B-ApiGwAlarm');
    assert.ok(byAlarm);
    const byKey = AUTOMATIC_RUNBOOK_REGISTRY.resolveByKey(byAlarm.descriptor.key);
    assert.deepStrictEqual(byKey?.descriptor, byAlarm.descriptor);
  });

  it('registers the lollipop authorizer alarm as a SEND authorization Lambda runbook', () => {
    const resolved = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(
      'pn-lollipopAuthorizerLambda-LogInvocationErrors-Alarm',
    );

    assert.ok(resolved);
    assert.strictEqual(resolved.product, 'SEND');
    assert.strictEqual(resolved.descriptor.kind, 'LAMBDA');
    assert.deepStrictEqual(resolved.descriptor.categories, ['AUTHORIZATION']);
  });

  it('registers every SEND downstream alarm with the expected service category', () => {
    const alarms: ReadonlyArray<readonly [string, string]> = [
      ['emd-downstream-detection-Alarm', 'INTEGRATION'],
      ['pn-external-registries-OneTrust-downstream-detection-Alarm', 'INTEGRATION'],
      ['pn-national-registries-AdE-downstream-detection-Alarm', 'INTEGRATION'],
      ['pn-national-registries-ANPR-downstream-detection-Alarm', 'INTEGRATION'],
      ['pn-national-registries-InfoCamere-downstream-detection-Alarm', 'INTEGRATION'],
      ['pn-national-registries-INAD-downstream-detection-Alarm', 'INTEGRATION'],
      ['pn-national-registries-IPA-downstream-detection-Alarm', 'INTEGRATION'],
      ['personal-data-vault-SelfcarePG-downstream-detection-Alarm', 'INTEGRATION'],
      ['pn-address-manager-POSTEL-downstream-detection-Alarm', 'DELIVERY'],
    ];

    for (const [alarmName, category] of alarms) {
      const resolved = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(alarmName);
      assert.ok(resolved, `${alarmName} must be registered`);
      assert.strictEqual(resolved.product, 'SEND');
      assert.strictEqual(resolved.descriptor.kind, 'SERVICE');
      assert.deepStrictEqual(resolved.descriptor.categories, [category]);
    }
  });

  it('resolves INTEROP environment aliases to the same canonical descriptor', () => {
    const prod = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName('k8s-interop-be-backend-for-frontend-errors-prod');
    const att = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName('k8s-interop-be-backend-for-frontend-errors-att');
    const test = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName('k8s-interop-be-backend-for-frontend-errors-test');

    assert.ok(prod);
    assert.ok(att);
    assert.ok(test);
    assert.strictEqual(prod.descriptor.key, 'k8s-interop-be-backend-for-frontend-errors');
    assert.deepStrictEqual(att.descriptor, prod.descriptor);
    assert.deepStrictEqual(test.descriptor, prod.descriptor);
    assert.deepStrictEqual(prod.descriptor.alarmNames, [
      'k8s-interop-be-backend-for-frontend-errors-att',
      'k8s-interop-be-backend-for-frontend-errors-prod',
      'k8s-interop-be-backend-for-frontend-errors-test',
    ]);
  });

  it('resolves INTEROP notification user lifecycle aliases to the same canonical descriptor', () => {
    const prod = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(
      'k8s-interop-be-notification-user-lifecycle-consumer-errors-prod',
    );
    const att = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(
      'k8s-interop-be-notification-user-lifecycle-consumer-errors-att',
    );
    const test = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(
      'k8s-interop-be-notification-user-lifecycle-consumer-errors-test',
    );

    assert.ok(prod);
    assert.ok(att);
    assert.ok(test);
    assert.strictEqual(prod.descriptor.key, 'k8s-interop-be-notification-user-lifecycle-consumer-errors');
    assert.deepStrictEqual(att.descriptor, prod.descriptor);
    assert.deepStrictEqual(test.descriptor, prod.descriptor);
    assert.deepStrictEqual(prod.descriptor.alarmNames, [
      'k8s-interop-be-notification-user-lifecycle-consumer-errors-att',
      'k8s-interop-be-notification-user-lifecycle-consumer-errors-prod',
      'k8s-interop-be-notification-user-lifecycle-consumer-errors-test',
    ]);
    assert.deepStrictEqual(prod.descriptor.categories, ['INTEROP']);
  });

  it('resolves INTEROP public catalog aliases with the environment in the middle of the alarm name', () => {
    const prod = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(
      'k8s-interop-public-catalog-astro-frontend-errors-prod-public-catalog',
    );
    const att = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(
      'k8s-interop-public-catalog-astro-frontend-errors-att-public-catalog',
    );

    assert.ok(prod);
    assert.ok(att);
    assert.strictEqual(prod.descriptor.key, 'k8s-interop-public-catalog-astro-frontend-errors');
    assert.deepStrictEqual(att.descriptor, prod.descriptor);
    assert.strictEqual(prod.descriptor.kind, 'SERVICE');
    assert.deepStrictEqual(prod.descriptor.categories, ['INTEROP']);
  });

  it('resolves INTEROP Selfcare users updater aliases to the same canonical descriptor', () => {
    const prod = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(
      'k8s-interop-be-selfcare-client-users-updater-errors-prod',
    );
    const att = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(
      'k8s-interop-be-selfcare-client-users-updater-errors-att',
    );
    const test = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(
      'k8s-interop-be-selfcare-client-users-updater-errors-test',
    );

    assert.ok(prod);
    assert.ok(att);
    assert.ok(test);
    assert.strictEqual(prod.descriptor.key, 'k8s-interop-be-selfcare-client-users-updater-errors');
    assert.deepStrictEqual(att.descriptor, prod.descriptor);
    assert.deepStrictEqual(test.descriptor, prod.descriptor);
    assert.deepStrictEqual(prod.descriptor.alarmNames, [
      'k8s-interop-be-selfcare-client-users-updater-errors-att',
      'k8s-interop-be-selfcare-client-users-updater-errors-prod',
      'k8s-interop-be-selfcare-client-users-updater-errors-test',
    ]);
    assert.deepStrictEqual(prod.descriptor.categories, ['INTEROP']);
  });

  it('resolves INTEROP Selfcare API Gateway 5xx aliases to the same APIGW descriptor', () => {
    const prod = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName('interop-selfcare-1.0-prod-apigw-5xx');
    const att = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName('interop-selfcare-1.0-att-apigw-5xx');
    const test = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName('interop-selfcare-1.0-test-apigw-5xx');

    assert.ok(prod);
    assert.ok(att);
    assert.ok(test);
    assert.strictEqual(prod.descriptor.key, 'interop-selfcare-1.0-apigw-5xx');
    assert.strictEqual(prod.descriptor.kind, 'APIGW');
    assert.deepStrictEqual(att.descriptor, prod.descriptor);
    assert.deepStrictEqual(test.descriptor, prod.descriptor);
    assert.deepStrictEqual(prod.descriptor.alarmNames, [
      'interop-selfcare-1.0-att-apigw-5xx',
      'interop-selfcare-1.0-prod-apigw-5xx',
      'interop-selfcare-1.0-test-apigw-5xx',
    ]);
    assert.deepStrictEqual(prod.descriptor.categories, ['INTEROP']);
  });

  it('resolves every INTEROP auth-server API Gateway 4xx alias, including low-request alarms', () => {
    const alarmNames = [
      'interop-auth-server-prod-apigw-4xx',
      'interop-auth-server-att-apigw-4xx',
      'interop-auth-server-test-apigw-4xx',
      'interop-auth-server-att-apigw-4xx-low-requests',
      'interop-auth-server-test-apigw-4xx-low-requests',
    ];
    const resolved = alarmNames.map((alarmName) => AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName(alarmName));

    assert.ok(resolved.every((entry) => entry !== undefined));
    const descriptor = resolved[0]?.descriptor;
    assert.ok(descriptor !== undefined);
    assert.strictEqual(descriptor.key, 'interop-auth-server-apigw-4xx');
    assert.strictEqual(descriptor.kind, 'APIGW');
    assert.deepStrictEqual(descriptor.categories, ['INTEROP']);
    assert.deepStrictEqual(descriptor.alarmNames, [...alarmNames].sort());
    assert.ok(resolved.every((entry) => entry?.descriptor === resolved[0]?.descriptor));
  });

  it('lists stable sorted descriptors and validates every cloud runbook', () => {
    const first = AUTOMATIC_RUNBOOK_REGISTRY.listDescriptors();
    const second = AUTOMATIC_RUNBOOK_REGISTRY.listDescriptors();
    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(
      first.map(({ key }) => key),
      first.map(({ key }) => key).sort(),
    );
    assert.ok(first.every(({ definitionDigest }) => /^sha256-[a-f0-9]{64}$/.test(definitionDigest)));
    assert.doesNotThrow(() => AUTOMATIC_RUNBOOK_REGISTRY.validateForCloud());
  });

  it('builds each runbook once per descriptor or validation pass', () => {
    const source = AUTOMATIC_RUNBOOK_REGISTRY.resolveByKey('pn-delivery-B2B-ApiGwAlarm');
    assert.ok(source);
    let buildCalls = 0;
    const registry = new AutomaticRunbookRegistry([
      {
        key: source.descriptor.key,
        product: source.product,
        alarmNames: source.descriptor.alarmNames,
        kind: source.descriptor.kind,
        categories: source.descriptor.categories as readonly [string, ...string[]],
        build: () => {
          buildCalls += 1;
          return source.build();
        },
      },
    ]);

    assert.strictEqual(buildCalls, 1);
    registry.validateForCloud();
    assert.strictEqual(buildCalls, 2);
  });
});
