import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertKnownCaseStepRefs,
  assertPreStepIds,
  failAlarmConfig,
  type AlarmConfigValidationContext,
} from '../alarmConfigValidation.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { StepDescriptor } from '../../types/StepDescriptor.js';

const CTX: AlarmConfigValidationContext = { builderName: 'createFooAlarmRunbook', runbookId: 'foo-Alarm' };

function step(id: string): StepDescriptor {
  return {
    step: {
      id,
      label: id,
      kind: 'data' as const,
      // eslint-disable-next-line @typescript-eslint/require-await
      execute: async () => ({ success: true as const }),
    },
  };
}

function knownCase(id: string, ref: string): KnownCase {
  return {
    id,
    description: id,
    priority: 100,
    condition: { type: 'exists', ref },
    action: { type: 'log', level: 'info', title: id },
  };
}

describe('failAlarmConfig', () => {
  it('attributes the error to the calling builder and runbook', () => {
    assert.throws(
      () => failAlarmConfig(CTX, 'qualcosa non va.'),
      /^Error: createFooAlarmRunbook "foo-Alarm": qualcosa non va\.$/,
    );
  });
});

describe('assertPreStepIds', () => {
  it('returns the declared ids when there is no collision', () => {
    const ids = assertPreStepIds(CTX, [step('a'), step('b')], new Set(['reserved']));
    assert.deepStrictEqual([...ids], ['a', 'b']);
  });

  it('accepts an absent preSteps list', () => {
    assert.strictEqual(assertPreStepIds(CTX, undefined, new Set()).size, 0);
  });

  it('rejects a duplicate preStep id', () => {
    assert.throws(() => assertPreStepIds(CTX, [step('a'), step('a')], new Set()), /declared more than once/);
  });

  it('rejects a preStep id that shadows the canonical pipeline', () => {
    assert.throws(
      () => assertPreStepIds(CTX, [step('parse-errors')], new Set(['parse-errors'])),
      /collides with a reserved pipeline step id/,
    );
  });
});

describe('assertKnownCaseStepRefs', () => {
  it('accepts cases that only reference wired steps', () => {
    assertKnownCaseStepRefs(CTX, [knownCase('c1', 'steps.query-foo')], new Set(['query-foo']), '.');
  });

  it('accepts cases that reference no step at all', () => {
    assertKnownCaseStepRefs(CTX, [knownCase('c1', 'vars.traceId')], new Set(), '.');
  });

  it('rejects a reference to a step the pipeline never wires, appending the family hint', () => {
    assert.throws(
      () => assertKnownCaseStepRefs(CTX, [knownCase('c1', 'steps.missing')], new Set(['query-foo']), ' (hint).'),
      /createFooAlarmRunbook "foo-Alarm": knownCase "c1" references step "missing" which is not wired in this runbook \(hint\)\./,
    );
  });
});
