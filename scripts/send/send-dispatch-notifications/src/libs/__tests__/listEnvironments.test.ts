import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import type { Core } from '@go-automation/go-common';
import { Dispatch } from '@go-automation/go-send';

import { DispatchUsageError } from '../DispatchUsageError.js';
import { listEnvironments } from '../listEnvironments.js';
import { createTestScript, writeFixture } from './helpers/testScript.js';

describe('listEnvironments', () => {
  it('reports a malformed environments file as a usage error, not a stack trace', async () => {
    const { dir, logger } = await createTestScript();
    const file = path.join(dir, 'environments.yaml');
    await writeFixture(file, 'environments:\n  ente-test: [unclosed\n');
    const loader = new Dispatch.EnvironmentLoader(() => undefined);

    await assert.rejects(listEnvironments(logger as unknown as Core.GOLogger, loader, file), DispatchUsageError);
  });
});
