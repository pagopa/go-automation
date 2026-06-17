import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOConfigParameterType } from '../../config/GOConfigParameterType.js';
import { GOScript } from '../GOScript.js';

interface SummaryRecord {
  readonly message: string;
  readonly level: string;
  readonly data?: { readonly configuration?: Record<string, { value: string; source: string }> };
}

describe('GOScript logging in AWS-managed runtime', () => {
  // Simulate AWS Lambda so GOScript selects the JSON handler and the structured summary.
  let previousLambdaEnv: string | undefined;
  before(() => {
    previousLambdaEnv = process.env['AWS_LAMBDA_FUNCTION_NAME'];
    process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'go-test-fn';
  });
  after(() => {
    if (previousLambdaEnv === undefined) {
      delete process.env['AWS_LAMBDA_FUNCTION_NAME'];
    } else {
      process.env['AWS_LAMBDA_FUNCTION_NAME'] = previousLambdaEnv;
    }
  });

  async function captureLoadConfig(): Promise<string> {
    let stdout = '';
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
      return true;
    };

    try {
      const script = new GOScript({
        metadata: { name: 'json log test', version: '1.0.0', description: 'json', authors: ['test'] },
        config: {
          parameters: [
            {
              name: 'probe.value',
              type: GOConfigParameterType.STRING,
              description: 'probe',
              required: false,
              defaultValue: 'v',
            },
          ],
        },
      });

      await script.loadConfig();
    } finally {
      process.stdout.write = originalWrite;
    }

    return stdout;
  }

  it('emits only single-line JSON records (no raw ANSI/table)', async () => {
    const stdout = await captureLoadConfig();

    const lines = stdout.split('\n').filter((line) => line.length > 0);
    assert.ok(lines.length > 0, 'expected at least one log line');
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `each line must be valid JSON: ${line}`);
      assert.ok(!line.includes('\x1b['), 'no ANSI escapes in JSON output');
    }
  });

  it('emits the configuration summary as a single structured event', async () => {
    const stdout = await captureLoadConfig();

    const summaryLine = stdout
      .split('\n')
      .filter(Boolean)
      .find((line) => line.includes('"Configuration summary"'));
    assert.ok(summaryLine !== undefined, 'configuration summary event present');

    const summary = JSON.parse(summaryLine) as SummaryRecord;
    assert.strictEqual(summary.message, 'Configuration summary');
    const configuration = summary.data?.configuration;
    assert.ok(configuration !== undefined, 'summary carries structured configuration data');
    assert.strictEqual(configuration['probe.value']?.value, 'v');
  });
});
