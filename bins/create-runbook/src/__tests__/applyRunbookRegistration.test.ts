import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyRunbookRegistration } from '../wiring/registerInCatalog.js';

const SAMPLE_REGISTRY = `import type { AutomaticRunbookKind } from '@go-automation/go-execute-runbook-contracts';

import { buildAddressBookIoApiGwAlarmRunbook } from './runbooks/pn-address-book-io-IO-ApiGwAlarm/runbook.js';
import { buildDeliveryB2BApiGwAlarmRunbook } from './runbooks/pn-delivery-B2B-ApiGwAlarm/runbook.js';

interface AutomaticRunbookRegistration {
  readonly key: string;
  readonly kind: AutomaticRunbookKind;
}

const REGISTRATIONS: ReadonlyArray<AutomaticRunbookRegistration> = [
  registration('pn-address-book-io-IO-ApiGwAlarm', 'APIGW', ['DELIVERY'], buildAddressBookIoApiGwAlarmRunbook),
  registration('pn-delivery-B2B-ApiGwAlarm', 'APIGW', ['DELIVERY'], buildDeliveryB2BApiGwAlarmRunbook),
];

function registration(): AutomaticRunbookRegistration {
  throw new Error('not executed');
}
`;

const REGISTRATION = {
  id: 'pn-foo-BAR-ApiGwAlarm',
  builderName: 'buildFooBarApiGwAlarmRunbook',
  importPath: './runbooks/pn-foo-BAR-ApiGwAlarm/runbook.js',
  kind: 'APIGW' as const,
  categories: ['DELIVERY'] as const,
};

describe('applyRunbookRegistration', () => {
  it('adds the import after the last runbook import', () => {
    const { content, changed } = applyRunbookRegistration(SAMPLE_REGISTRY, REGISTRATION);

    assert.strictEqual(changed, true);
    assert.match(
      content,
      /buildDeliveryB2BApiGwAlarmRunbook \} from '\.\/runbooks\/pn-delivery-B2B-ApiGwAlarm\/runbook\.js';\nimport \{ buildFooBarApiGwAlarmRunbook \} from '\.\/runbooks\/pn-foo-BAR-ApiGwAlarm\/runbook\.js';/,
    );
  });

  it('adds the typed registration inside the catalog array', () => {
    const { content } = applyRunbookRegistration(SAMPLE_REGISTRY, REGISTRATION);

    const entryIndex = content.indexOf(
      `registration('pn-foo-BAR-ApiGwAlarm', 'APIGW', ["DELIVERY"], buildFooBarApiGwAlarmRunbook),`,
    );
    const helperIndex = content.indexOf('function registration');

    assert.ok(entryIndex >= 0, 'registry entry should be present');
    assert.ok(entryIndex < helperIndex, 'registry entry should be inside REGISTRATIONS');
  });

  it('is idempotent when the builder is already registered', () => {
    const once = applyRunbookRegistration(SAMPLE_REGISTRY, REGISTRATION);
    const twice = applyRunbookRegistration(once.content, REGISTRATION);

    assert.strictEqual(twice.changed, false);
    assert.strictEqual(twice.content, once.content);
  });
});
