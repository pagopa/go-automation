import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyRunbookRegistration } from '../wiring/registerInAnalyzer.js';

const SAMPLE_MAIN = `import { Core } from '@go-automation/go-common';
import type { Runbook } from '@go-automation/go-runbook';

import { buildAddressBookIoApiGwAlarmRunbook } from './libs/runbooks/pn-address-book-io-IO-ApiGwAlarm/runbook.js';
import { buildDeliveryB2BApiGwAlarmRunbook } from './libs/runbooks/pn-delivery-B2B-ApiGwAlarm/runbook.js';

import { DEFAULT_TIME_WINDOW_MINUTES } from './libs/runbooks/constants.js';

const RUNBOOK_REGISTRY = new Map<string, () => Runbook>([
  ['pn-address-book-io-IO-ApiGwAlarm', buildAddressBookIoApiGwAlarmRunbook],
  ['pn-delivery-B2B-ApiGwAlarm', buildDeliveryB2BApiGwAlarmRunbook],
]);

export async function main(): Promise<void> {
  const params = new Map<string, string>([['alarmName', 'x']]);
  void params;
  void Core;
  void DEFAULT_TIME_WINDOW_MINUTES;
}
`;

const REGISTRATION = {
  id: 'pn-foo-BAR-ApiGwAlarm',
  builderName: 'buildFooBarApiGwAlarmRunbook',
  importPath: './libs/runbooks/pn-foo-BAR-ApiGwAlarm/runbook.js',
};

describe('applyRunbookRegistration', () => {
  it('adds the import after the last runbook import', () => {
    const { content, changed } = applyRunbookRegistration(SAMPLE_MAIN, REGISTRATION);

    assert.strictEqual(changed, true);
    assert.match(
      content,
      /buildDeliveryB2BApiGwAlarmRunbook \} from '\.\/libs\/runbooks\/pn-delivery-B2B-ApiGwAlarm\/runbook\.js';\nimport \{ buildFooBarApiGwAlarmRunbook \} from '\.\/libs\/runbooks\/pn-foo-BAR-ApiGwAlarm\/runbook\.js';/,
    );
  });

  it('adds the registry entry inside the registry map', () => {
    const { content } = applyRunbookRegistration(SAMPLE_MAIN, REGISTRATION);

    const entryIndex = content.indexOf("['pn-foo-BAR-ApiGwAlarm', buildFooBarApiGwAlarmRunbook],");
    const mainIndex = content.indexOf('export async function main');

    assert.ok(entryIndex >= 0, 'registry entry should be present');
    assert.ok(entryIndex < mainIndex, 'registry entry should be inside the registry, before main()');
  });

  it('is idempotent when the builder is already registered', () => {
    const once = applyRunbookRegistration(SAMPLE_MAIN, REGISTRATION);
    const twice = applyRunbookRegistration(once.content, REGISTRATION);

    assert.strictEqual(twice.changed, false);
    assert.strictEqual(twice.content, once.content);
  });
});
