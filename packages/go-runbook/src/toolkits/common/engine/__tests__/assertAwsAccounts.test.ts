import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLogger } from '@pagopa/go-common/logging';

import { RunbookMissingServicesError } from '../../../../engine/errors/RunbookMissingServicesError.js';
import { IfBranchStep } from '../../../../engine/steps/control/IfBranchStep.js';
import type { Runbook } from '../../../../engine/types/Runbook.js';
import type { Step } from '../../../../engine/types/Step.js';
import type { StepKind } from '../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../engine/types/StepResult.js';
import type { AwsAccountSelection } from '../../accounts/AwsAccountSelection.js';
import { resolveAwsAccountSelection } from '../../accounts/resolveAwsAccountSelection.js';
import { CORE, EXTRA, port, REGION, rejectsWith } from '../../accounts/__tests__/fixtures.js';
import type { OperationalContext } from '../../services/OperationalContext.js';
import type { OperationalServiceName } from '../../services/OperationalServiceName.js';
import type { ServiceRegistry } from '../../services/ServiceRegistry.js';
import { OperationalStep } from '../../steps/OperationalStep.js';
import type { AwsExecutionEnvironment } from '../../telemetry/AwsExecutionEnvironment.js';
import { createTestServiceRegistry } from '../../testing/createTestServiceRegistry.js';
import type { InMemoryAwsAccountsPortOptions } from '../../testing/InMemoryAwsAccountsPortOptions.js';
import { OperationalRunbookEngine } from '../OperationalRunbookEngine.js';

/** Step that declares a selection and records the accounts it reads. */
class SelectingStep extends OperationalStep<void> implements Step<void> {
  readonly id: string;
  readonly label = 'Selecting';
  readonly kind: StepKind = 'data';
  read: string[] = [];

  constructor(
    id: string,
    private readonly selection: AwsAccountSelection,
  ) {
    super();
    this.id = id;
  }

  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['awsAccounts'];
  }

  override accountSelections(): ReadonlyArray<AwsAccountSelection> {
    return [this.selection];
  }

  override async execute(context: OperationalContext): Promise<StepResult<void>> {
    await Promise.resolve();
    for (const resolved of resolveAwsAccountSelection(context, this.selection)) {
      // Throws if the pre-execution check had not prepared the reader.
      context.services.awsAccounts?.cloudWatchLogsFor(resolved.account);
      this.read.push(resolved.accountId);
    }
    return { success: true };
  }
}

/** Records whether the pipeline started. */
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

function runbook(steps: ReadonlyArray<Step>): Runbook {
  return {
    metadata: {
      id: 'accounts',
      name: 'Accounts',
      description: '',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    steps: steps.map((step) => ({ step })),
    knownCases: [],
    fallbackAction: { type: 'log', level: 'info', title: 'done' },
  };
}

const ENV: AwsExecutionEnvironment = { invokedBy: 'manual', awsProfiles: [], region: REGION };
const BOTH: AwsAccountSelection = { subject: 'both', accounts: [CORE, EXTRA], scope: 'every-account' };
const OF_OCCURRENCE: AwsAccountSelection = {
  subject: 'occurrence',
  accounts: [CORE, EXTRA],
  scope: 'occurrence-account',
};

function services(options: Partial<InMemoryAwsAccountsPortOptions>): ServiceRegistry {
  return createTestServiceRegistry({ awsAccounts: port(options) });
}

async function run(steps: ReadonlyArray<Step>, registry: ServiceRegistry): Promise<unknown> {
  return new OperationalRunbookEngine(new GOLogger()).execute(runbook(steps), new Map(), registry, ENV);
}

describe('pre-execution check of the logical accounts (EVO-AWSACCT-OPUS-01 §6.3)', () => {
  it('prepares the accounts of the environment and lets the step read them', async () => {
    const step = new SelectingStep('both', BOTH);
    await run([step], services({ occurrence: { accountId: '000000000201', region: REGION } }));
    assert.deepEqual(step.read, ['000000000201', '000000000202']);
  });

  it('rejects a missing directory entry before the first step', async () => {
    const spy = new SpyStep();
    await assert.rejects(
      async () => run([spy, new SelectingStep('both', BOTH)], services({ environment: 'dev' })),
      rejectsWith('AWS_ACCOUNT_NOT_CONFIGURED'),
    );
    assert.equal(spy.executed, false);
  });

  it('checks a selecting step nested in an IfBranchStep', async () => {
    const spy = new SpyStep();
    const branch = new IfBranchStep({
      id: 'branch',
      label: 'Branch',
      condition: { type: 'exists', ref: 'vars.never' },
      thenSteps: [new SelectingStep('nested', BOTH)],
    });
    await assert.rejects(
      async () => run([spy, branch], services({})),
      rejectsWith('AWS_ACCOUNT_ENVIRONMENT_NOT_CONFIGURED'),
    );
    assert.equal(spy.executed, false);
  });

  it('rejects an occurrence outside an every-account selection before the first step', async () => {
    const spy = new SpyStep();
    await assert.rejects(
      async () =>
        run(
          [spy, new SelectingStep('both', BOTH)],
          services({ occurrence: { accountId: '000000000103', region: REGION } }),
        ),
      rejectsWith('AWS_OCCURRENCE_ACCOUNT_MISMATCH'),
    );
    assert.equal(spy.executed, false);
  });

  it('needs no credentials for an account the occurrence excludes', async () => {
    const step = new SelectingStep('occurrence', OF_OCCURRENCE);
    await run([step], services({ occurrence: { accountId: '000000000101', region: REGION }, unreachable: [EXTRA] }));
    assert.deepEqual(step.read, ['000000000101']);
  });

  it('fails before the first step when an account it reads is unreachable', async () => {
    const spy = new SpyStep();
    await assert.rejects(
      async () => run([spy, new SelectingStep('both', BOTH)], services({ environment: 'prod', unreachable: [EXTRA] })),
      rejectsWith('AWS_ACCOUNT_UNREACHABLE'),
    );
    assert.equal(spy.executed, false);
  });

  it('rejects a production-only step for a same-named occurrence in uat and for a local uat execution', async () => {
    const prodOnly: AwsAccountSelection = { ...OF_OCCURRENCE, accounts: [EXTRA], environments: ['prod'] };
    for (const options of [{ occurrence: { accountId: '000000000202', region: REGION } }, { environment: 'uat' }]) {
      const spy = new SpyStep();
      await assert.rejects(
        async () => run([spy, new SelectingStep('prod-only', prodOnly)], services(options)),
        rejectsWith('AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED'),
      );
      assert.equal(spy.executed, false);
    }
  });

  it('reports a missing account port as a missing service', async () => {
    // Safe: the registry lacks the port on purpose.
    const registry = { ...createTestServiceRegistry(), awsAccounts: undefined } as unknown as ServiceRegistry;
    await assert.rejects(
      async () => run([new SelectingStep('both', BOTH)], registry),
      (error: unknown) => error instanceof RunbookMissingServicesError && error.missing.includes('awsAccounts'),
    );
  });

  it('does not need the account port when no step declares a selection', async () => {
    // Safe: the registry lacks the port on purpose.
    const registry = { ...createTestServiceRegistry(), awsAccounts: undefined } as unknown as ServiceRegistry;
    const spy = new SpyStep();
    await run([spy], registry);
    assert.equal(spy.executed, true);
  });
});
