import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLogger } from '@pagopa/go-common/logging';

import { RunbookEngine } from '../../../../engine/core/RunbookEngine.js';
import { RunbookMissingServicesError } from '../../../../engine/errors/RunbookMissingServicesError.js';
import { createTestWorkflowServices } from '../../../../engine/testing/createTestWorkflowServices.js';
import type { CaseAction } from '../../../../engine/types/CaseAction.js';
import type { Runbook } from '../../../../engine/types/Runbook.js';
import type { Step } from '../../../../engine/types/Step.js';
import type { StepKind } from '../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../engine/types/StepResult.js';
import { NOOP_RUNBOOK_REPORTER } from '../../../../engine/reporting/NOOP_RUNBOOK_REPORTER.js';
import type { ServiceRegistry } from '../../services/ServiceRegistry.js';
import { createTestServiceRegistry } from '../../testing/createTestServiceRegistry.js';
import { OperationalRunbookEngine } from '../OperationalRunbookEngine.js';
import { createTestRunbook } from '../../../../__tests__/helpers/createTestRunbook.js';
import type { AwsExecutionEnvironment } from '../../telemetry/AwsExecutionEnvironment.js';

/** Records whether the pipeline started: the service check must reject the execution before it. */
class SpyStep implements Step<void> {
  readonly id = 'spy';
  readonly label = 'Spy';
  readonly kind: StepKind = 'control';
  executed = false;

  async execute(): Promise<StepResult<void>> {
    await Promise.resolve();
    this.executed = true;
    return { success: true };
  }
}

/** A step that requires DynamoDB: a read in the pipeline, or the step of an update action. */
class DynamoStep implements Step<void> {
  readonly label = 'DynamoDB';

  constructor(
    readonly id: string,
    readonly kind: StepKind,
  ) {}

  requiredServices(): ReadonlyArray<string> {
    return ['dynamodb'];
  }

  async execute(): Promise<StepResult<void>> {
    return Promise.resolve({ success: true });
  }
}

const dynamoGet = (): DynamoStep => new DynamoStep('get', 'data');
const dynamoPut = (): DynamoStep => new DynamoStep('put', 'mutation');

function runbook(steps: ReadonlyArray<Step>, fallbackAction: CaseAction, knownCaseAction?: CaseAction): Runbook {
  return createTestRunbook({
    steps: steps.map((step) => ({ step })),
    knownCases:
      knownCaseAction === undefined
        ? []
        : [
            {
              id: 'case',
              description: 'case',
              condition: { type: 'exists', ref: 'vars.never' },
              action: knownCaseAction,
            },
          ],
    fallbackAction,
  });
}

const LOG: CaseAction = { type: 'log', level: 'info', title: 'done' };
const ENV: AwsExecutionEnvironment = { invokedBy: 'manual', awsProfiles: [], region: 'eu-south-1' };

type ExecutionFn = () => Promise<unknown>;

async function assertRejectedBeforeFirstStep(execute: ExecutionFn, spy: SpyStep): Promise<void> {
  await assert.rejects(execute, (error: unknown) => {
    assert.ok(error instanceof RunbookMissingServicesError);
    assert.deepStrictEqual(error.missing, ['dynamodb']);
    return true;
  });
  assert.strictEqual(spy.executed, false);
}

describe('service check of the engine', () => {
  it('rejects a DynamoDB step run with WorkflowServices only, wherever it is, before the first step', async () => {
    const composite: CaseAction = { type: 'composite', actions: [LOG, { type: 'update', step: dynamoPut() }] };
    const placements: ReadonlyArray<(spy: SpyStep) => Runbook> = [
      (spy) => runbook([spy, dynamoGet()], LOG),
      (spy) => runbook([spy], { type: 'update', step: dynamoPut() }),
      (spy) => runbook([spy], LOG, composite),
    ];
    for (const placement of placements) {
      const spy = new SpyStep();
      await assertRejectedBeforeFirstStep(
        async () => new RunbookEngine(new GOLogger()).execute(placement(spy), new Map(), createTestWorkflowServices()),
        spy,
      );
    }
  });
});

describe('OperationalRunbookEngine', () => {
  const operational = (): OperationalRunbookEngine => new OperationalRunbookEngine(new GOLogger());
  // Safe: these registries are wrong on purpose; the runtime check must catch what the cast hides.
  const withDynamo = (dynamodb: unknown): ServiceRegistry =>
    ({ ...createTestServiceRegistry(), dynamodb }) as unknown as ServiceRegistry;

  it('rejects dynamodb set to undefined or to an object without the port methods', async () => {
    for (const [dynamodb, placement] of [
      [undefined, (spy: SpyStep) => runbook([spy, dynamoGet()], LOG)],
      [{}, (spy: SpyStep) => runbook([spy], { type: 'update', step: dynamoPut() })],
    ] as const) {
      const spy = new SpyStep();
      await assertRejectedBeforeFirstStep(
        async () => operational().execute(placement(spy), new Map(), withDynamo(dynamodb), ENV),
        spy,
      );
    }
  });
  it('runs a runbook whose required services are complete', async () => {
    const result = await operational().execute(
      runbook([new SpyStep()], LOG),
      new Map(),
      createTestServiceRegistry(),
      ENV,
    );

    assert.strictEqual(result.status, 'completed');
  });

  it('keeps the operational boundary at compile time', () => {
    const engine = operational();
    const workflowOnly = { reporter: NOOP_RUNBOOK_REPORTER };
    // @ts-expect-error -- the reporter alone is not an operational service registry
    const execute = (): unknown => engine.execute(runbook([], LOG), new Map(), workflowOnly, ENV);
    // @ts-expect-error -- the operational engine is not a RunbookEngine and does not expose one
    const asEngine: RunbookEngine = engine;
    // @ts-expect-error -- the composed engine stays private
    const inner: unknown = engine.engine;

    assert.ok(typeof execute === 'function' && asEngine !== undefined && inner === inner);
  });
});
