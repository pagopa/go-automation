import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { SwitchStep } from '../SwitchStep.js';

describe('SwitchStep', () => {
  const base = {
    id: 'switch-status',
    label: 'Route by status',
    ref: 'vars.status',
    cases: { '404': 'handle-not-found', '500': 'handle-server-error' },
  } as const;
  const withDefault = new SwitchStep({ ...base, defaultGoTo: 'handle-unknown' });

  it('jumps to the branch matching the resolved value', async () => {
    const result = await withDefault.execute(createTestContext({ vars: { status: '404' } }));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.next, { goTo: 'handle-not-found' });
  });

  it('falls back to defaultGoTo when no case matches or the reference does not resolve', async () => {
    for (const vars of [{ status: '418' }, {}]) {
      assert.deepStrictEqual((await withDefault.execute(createTestContext({ vars }))).next, { goTo: 'handle-unknown' });
    }
  });

  it('continues when nothing matches and no default is declared', async () => {
    const result = await new SwitchStep(base).execute(createTestContext({ vars: { status: '418' } }));

    assert.strictEqual(result.next, 'continue');
  });
});
