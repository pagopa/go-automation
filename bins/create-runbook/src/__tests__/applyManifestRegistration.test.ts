import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { applyManifestRegistration, renderRegistrationFile } from '../wiring/registerInCatalog.js';
import type { RunbookRegistration } from '../wiring/registerInCatalog.js';
import { manifestFile, runbookDir } from '../inventoryLayout.js';

/**
 * The scaffolder patches the real manifest, so the tests read it from disk:
 * a fixture of its own would let the two drift apart unnoticed.
 */
const MANIFEST = readFileSync(manifestFile('SEND'), 'utf8');
const INTEROP_MANIFEST = readFileSync(manifestFile('INTEROP'), 'utf8');

const REGISTRATION: RunbookRegistration = {
  id: 'pn-foo-BAR-ApiGwAlarm',
  constName: 'FOO_BAR_API_GW_ALARM_REGISTRATION',
  product: 'SEND',
  family: 'apigw',
  kind: 'APIGW',
  categories: ['DELIVERY'],
};

describe('applyManifestRegistration', () => {
  it('wires the import and the array entry into its family block, keeping every existing line', () => {
    const { content, changed } = applyManifestRegistration(MANIFEST, REGISTRATION);

    assert.strictEqual(changed, true);
    // The import follows the last import of its family.
    assert.match(
      content,
      /\.\/apigw\/[^']+\/registration\.js';\nimport \{ FOO_BAR_API_GW_ALARM_REGISTRATION \} from '\.\/apigw\/pn-foo-BAR-ApiGwAlarm\/registration\.js';\n\/\/ Lambda/u,
    );
    // The entry closes the API Gateway block inside the array, not the end of the array.
    const arrayStart = content.indexOf('export const SEND_MANIFEST');
    const entryIndex = content.indexOf('  FOO_BAR_API_GW_ALARM_REGISTRATION,\n', arrayStart);
    assert.ok(arrayStart !== -1 && entryIndex > arrayStart, 'entry should be inside the array');
    assert.ok(entryIndex < content.indexOf('  // Lambda\n', arrayStart), 'entry should close the API Gateway block');
    for (const line of MANIFEST.split('\n')) {
      assert.ok(content.includes(line), `missing line after patch: ${line}`);
    }
  });

  it('opens the block of a family that has no runbook yet', () => {
    const k8sOnly = applyManifestRegistration(MANIFEST, {
      ...REGISTRATION,
      id: 'pn-foo-new-family',
      constName: 'FOO_NEW_FAMILY_REGISTRATION',
      family: 'newfamily',
    });

    assert.match(
      k8sOnly.content,
      /\/\/ newfamily\nimport \{ FOO_NEW_FAMILY_REGISTRATION \} from '\.\/newfamily\/pn-foo-new-family\/registration\.js';/u,
    );
    assert.ok(k8sOnly.content.includes('  // newfamily\n  FOO_NEW_FAMILY_REGISTRATION,\n];'));
  });

  it('is idempotent when the runbook is already registered', () => {
    const once = applyManifestRegistration(MANIFEST, REGISTRATION);
    const twice = applyManifestRegistration(once.content, REGISTRATION);

    assert.strictEqual(twice.changed, false);
    assert.strictEqual(twice.content, once.content);
  });

  it('registers a runbook whose constant is a suffix of an existing one', () => {
    // The manifest already imports SELFCARE_ONBOARDING_CONSUMER_REGISTRATION.
    // A substring test reported this one as registered, so its registration.ts
    // was written but the manifest never imported it.
    const suffix: RunbookRegistration = {
      ...REGISTRATION,
      id: 'onboarding-consumer',
      constName: 'ONBOARDING_CONSUMER_REGISTRATION',
    };
    const { content, changed } = applyManifestRegistration(MANIFEST, suffix);

    assert.strictEqual(changed, true);
    assert.match(
      content,
      /import \{ ONBOARDING_CONSUMER_REGISTRATION \} from '\.\/apigw\/onboarding-consumer\/registration\.js';/u,
    );
  });

  it('rejects a constant another runbook already exports, which would not compile', () => {
    const collision: RunbookRegistration = {
      ...REGISTRATION,
      product: 'INTEROP',
      id: 'another-runbook',
      constName: 'SELFCARE_APIGW_REGISTRATION',
    };

    assert.throws(
      () => applyManifestRegistration(INTEROP_MANIFEST, collision),
      /importa già SELFCARE_APIGW_REGISTRATION da apigw\/interop-selfcare/u,
    );
  });

  it('completes a half-wired manifest instead of reporting it as registered', () => {
    const withImportOnly = applyManifestRegistration(MANIFEST, REGISTRATION).content.replace(
      `  ${REGISTRATION.constName},\n`,
      '',
    );

    const { content, changed } = applyManifestRegistration(withImportOnly, REGISTRATION);

    assert.strictEqual(changed, true);
    assert.ok(content.includes(`  ${REGISTRATION.constName},\n`), 'the missing array entry should be added');
    const imports = [...content.matchAll(/import \{ FOO_BAR_API_GW_ALARM_REGISTRATION \}/gu)];
    assert.strictEqual(imports.length, 1, 'the existing import should not be duplicated');
  });
});

describe('renderRegistrationFile', () => {
  it('renders the registration source', () => {
    assert.strictEqual(
      renderRegistrationFile(REGISTRATION),
      [
        `import { RunbookKinds, RunbookProducts, type RunbookRegistration } from '../../../../toolkits/send/index.js';`,
        '',
        `import { buildRunbook } from './runbook.js';`,
        '',
        `const KEY = 'pn-foo-BAR-ApiGwAlarm';`,
        '',
        `export const FOO_BAR_API_GW_ALARM_REGISTRATION: RunbookRegistration = {`,
        '  key: KEY,',
        `  product: RunbookProducts.SEND,`,
        `  kind: RunbookKinds.APIGW,`,
        `  categories: ['DELIVERY'],`,
        '  alarmNames: [KEY],',
        '  build: buildRunbook,',
        '};',
        '',
      ].join('\n'),
    );
  });

  it('quotes every category', () => {
    const rendered = renderRegistrationFile({ ...REGISTRATION, categories: ['AUTHORIZATION', 'INTEGRATION'] });

    assert.match(rendered, /categories: \['AUTHORIZATION', 'INTEGRATION'\],/u);
  });

  it('matches the field order of a hand-maintained registration', () => {
    const existing = readFileSync(
      path.join(runbookDir('SEND', 'apigw', 'pn-delivery-B2B-ApiGwAlarm'), 'registration.ts'),
      'utf8',
    );
    const fields = (source: string): ReadonlyArray<string> =>
      [...source.matchAll(/^ {2}(\w+):/gmu)].map((match) => match[1] ?? '');

    assert.deepStrictEqual(fields(renderRegistrationFile(REGISTRATION)), fields(existing));
  });
});
