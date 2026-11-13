import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import type { Step } from '../../../../engine/types/Step.js';
import type { StepKind } from '../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../engine/types/StepResult.js';
import type { OperationalContext } from '../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../services/OperationalServiceName.js';
import { createTestServiceRegistry } from '../../testing/createTestServiceRegistry.js';
import { canonicalizeJson } from '@pagopa/go-common/json';
import { OperationalStep } from '../OperationalStep.js';

const SRC_DIR = fileURLToPath(new URL('../../../../', import.meta.url));

class AthenaProbeStep extends OperationalStep<number> implements Step<number> {
  readonly id = 'probe';
  readonly label = 'Probe';
  readonly kind: StepKind = 'data';

  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['athena'];
  }

  override async execute(context: OperationalContext): Promise<StepResult<number>> {
    const rows = await context.services.athena.query('db', 'select 1');
    return { success: true, output: rows.length };
  }
}

describe('OperationalStep', () => {
  it('declares its services on the prototype, so they stay out of the definition digest', () => {
    const step = new AthenaProbeStep();

    assert.deepStrictEqual(step.requiredServices(), ['athena']);
    assert.deepStrictEqual(Object.keys(step), ['id', 'label', 'kind']);
    assert.strictEqual(canonicalizeJson(step), '{"id":"probe","kind":"data","label":"Probe"}');
  });

  it('executes with the operational context', async () => {
    const services = createTestServiceRegistry({ athena: { query: async () => Promise.resolve([{ a: '1' }]) } });
    const context = { services } as unknown as OperationalContext;

    assert.deepStrictEqual(await new AthenaProbeStep().execute(context), { success: true, output: 1 });
  });

  // EVO-RBREORG-OPUS-01 §7.1.3 A: a step typed on the operational context must declare its services.
  it('is extended by every step whose execute takes an OperationalContext', () => {
    const offenders = ts.sys
      .readDirectory(SRC_DIR, ['.ts'], ['**/__tests__/**'])
      .filter((file) => {
        const text = ts.sys.readFile(file) ?? '';
        return /execute\(context: OperationalContext/u.test(text) && !/extends OperationalStep\b/u.test(text);
      })
      .filter((file) => !file.endsWith('/OperationalStep.ts'));

    assert.deepStrictEqual(offenders, []);
  });
});
