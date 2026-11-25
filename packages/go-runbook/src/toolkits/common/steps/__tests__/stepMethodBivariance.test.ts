import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RunbookContext } from '../../../../engine/types/RunbookContext.js';
import type { Step } from '../../../../engine/types/Step.js';
import type { StepResult } from '../../../../engine/types/StepResult.js';
import type { OperationalContext } from '../../services/OperationalContext.js';

/**
 * A step written against the operational context, as every AWS/HTTP step is.
 * It implements the engine's `Step` only because `Step.execute` is declared as a
 * **method**, whose parameter TypeScript checks bivariantly.
 */
class OperationalProbeStep {
  readonly id = 'probe';
  readonly label = 'Probe';
  readonly kind = 'data' as const;

  async execute(context: OperationalContext): Promise<StepResult<number>> {
    await Promise.resolve();
    return { success: true, output: context.services.reporter === undefined ? 0 : 1 };
  }
}

/** `execute` as a function-typed property, as `method-signature-style: property` would rewrite it. */
type PropertyExecuteFn = (context: RunbookContext) => Promise<StepResult<number>>;

/** The same contract written with a property signature. */
interface PropertyStyleStep {
  readonly id: string;
  readonly execute: PropertyExecuteFn;
}

describe('Step.execute method bivariance (type guard)', () => {
  it('lets a step typed on OperationalContext implement the engine Step without generics', () => {
    // Compile-time check: this line stops compiling if `Step.execute` loses method bivariance.
    const step: Step<number> = new OperationalProbeStep();
    assert.strictEqual(step.id, 'probe');
  });

  it('would not compile with a property signature, which checks the parameter contravariantly', () => {
    // @ts-expect-error -- a property signature rejects the narrower OperationalContext parameter.
    const step: PropertyStyleStep = new OperationalProbeStep();
    assert.strictEqual(step.id, 'probe');
  });
});
