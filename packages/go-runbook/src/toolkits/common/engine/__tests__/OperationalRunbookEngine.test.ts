import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLogger } from '@pagopa/go-common/logging';

import { RunbookEngine } from '../../../../engine/core/RunbookEngine.js';
import { RunbookMissingServicesError } from '../../../../engine/errors/RunbookMissingServicesError.js';
import { IfBranchStep } from '../../../../engine/steps/control/IfBranchStep.js';
import { createTestWorkflowServices } from '../../../../engine/testing/createTestWorkflowServices.js';
import type { CaseAction } from '../../../../engine/types/CaseAction.js';
import type { Runbook } from '../../../../engine/types/Runbook.js';
import type { Step } from '../../../../engine/types/Step.js';
import type { StepKind } from '../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../engine/types/StepResult.js';
import { NOOP_RUNBOOK_REPORTER } from '../../../../engine/reporting/NOOP_RUNBOOK_REPORTER.js';
import type { ServiceRegistry } from '../../services/ServiceRegistry.js';
import { DynamoDBGetStep } from '../../steps/aws/dynamodb/DynamoDBGetStep.js';
import { DynamoDBPutStep } from '../../steps/aws/dynamodb/DynamoDBPutStep.js';
import { createTestServiceRegistry } from '../../testing/createTestServiceRegistry.js';
import { OperationalRunbookEngine } from '../OperationalRunbookEngine.js';
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

const dynamoGet = (): DynamoDBGetStep => new DynamoDBGetStep({ id: 'get', label: 'Get', tableName: 't', key: {} });
const dynamoPut = (): DynamoDBPutStep => new DynamoDBPutStep({ id: 'put', label: 'Put', tableName: 't', item: {} });

function runbook(steps: ReadonlyArray<Step>, fallbackAction: CaseAction, knownCaseAction?: CaseAction): Runbook {
  return {
    metadata: {
      id: 'service-check',
      name: 'Service check',
      description: '',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    steps: steps.map((step) => ({ step })),
    knownCases:
      knownCaseAction === undefined
        ? []
        : [
            {
              id: 'case',
              description: 'case',
              priority: 1,
              condition: { type: 'exists', ref: 'vars.never' },
              action: knownCaseAction,
            },
          ],
    fallbackAction,
  };
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

describe('service check of the engine (EVO-RBREORG-OPUS-01 §7.1.3 A)', () => {
  const engine = (): RunbookEngine => new RunbookEngine(new GOLogger());

  it('rejects a DynamoDB step run with WorkflowServices only, before the first step', async () => {
    const spy = new SpyStep();
    await assertRejectedBeforeFirstStep(
      async () => engine().execute(runbook([spy, dynamoGet()], LOG), new Map(), createTestWorkflowServices()),
      spy,
    );
  });

  it('rejects a DynamoDB step nested in an IfBranchStep', async () => {
    const spy = new SpyStep();
    const branch = new IfBranchStep({
      id: 'branch',
      label: 'Branch',
      condition: { type: 'exists', ref: 'vars.x' },
      thenSteps: [dynamoGet()],
    });
    await assertRejectedBeforeFirstStep(
      async () => engine().execute(runbook([spy, branch], LOG), new Map(), createTestWorkflowServices()),
      spy,
    );
  });

  it('rejects a DynamoDB step in an update action of the fallback', async () => {
    const spy = new SpyStep();
    await assertRejectedBeforeFirstStep(
      async () =>
        engine().execute(
          runbook([spy], { type: 'update', step: dynamoPut() }),
          new Map(),
          createTestWorkflowServices(),
        ),
      spy,
    );
  });

  it('rejects a DynamoDB step inside a composite action of a known case', async () => {
    const spy = new SpyStep();
    const composite: CaseAction = { type: 'composite', actions: [LOG, { type: 'update', step: dynamoPut() }] };
    await assertRejectedBeforeFirstStep(
      async () => engine().execute(runbook([spy], LOG, composite), new Map(), createTestWorkflowServices()),
      spy,
    );
  });
});

describe('OperationalRunbookEngine', () => {
  const operational = (): OperationalRunbookEngine => new OperationalRunbookEngine(new GOLogger());
  // Safe: these registries are wrong on purpose; the runtime check must catch what the cast hides.
  const withDynamo = (dynamodb: unknown): ServiceRegistry =>
    ({ ...createTestServiceRegistry(), dynamodb }) as unknown as ServiceRegistry;

  for (const [label, dynamodb] of [
    ['undefined', undefined],
    ['an object without the port methods', {}],
  ] as const) {
    it(`rejects dynamodb set to ${label}, for a pipeline step`, async () => {
      const spy = new SpyStep();
      await assertRejectedBeforeFirstStep(
        async () => operational().execute(runbook([spy, dynamoGet()], LOG), new Map(), withDynamo(dynamodb), ENV),
        spy,
      );
    });

    it(`rejects dynamodb set to ${label}, for a step in an action`, async () => {
      const spy = new SpyStep();
      await assertRejectedBeforeFirstStep(
        async () =>
          operational().execute(
            runbook([spy], { type: 'update', step: dynamoPut() }),
            new Map(),
            withDynamo(dynamodb),
            ENV,
          ),
        spy,
      );
    });
  }

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
