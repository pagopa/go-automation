import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOConfigParameterOptions } from '../../config/GOConfigParameter.js';
import { GOConfigParameterType } from '../../config/GOConfigParameterType.js';
import { GOScript } from '../GOScript.js';

interface ConfigSummaryEntry {
  readonly value: string;
  readonly source: string;
}

interface SummaryRecord {
  readonly message: string;
  readonly level: string;
  readonly data?: { readonly configuration?: Record<string, ConfigSummaryEntry> };
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

  async function captureLoadConfig(parameters: ReadonlyArray<GOConfigParameterOptions>): Promise<string> {
    let stdout = '';
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
      return true;
    };

    try {
      const script = new GOScript({
        metadata: { name: 'json log test', version: '1.0.0', description: 'json', authors: ['test'] },
        config: { parameters },
      });
      await script.loadConfig();
    } finally {
      process.stdout.write = originalWrite;
    }

    return stdout;
  }

  function findSummary(stdout: string): SummaryRecord {
    const summaryLine = stdout
      .split('\n')
      .filter(Boolean)
      .find((line) => line.includes('"Configuration summary"'));
    assert.ok(summaryLine !== undefined, 'configuration summary event present');
    return JSON.parse(summaryLine) as SummaryRecord;
  }

  const probeParam: GOConfigParameterOptions = {
    name: 'probe.value',
    type: GOConfigParameterType.STRING,
    description: 'probe',
    required: false,
    defaultValue: 'v',
  };

  it('emits only single-line JSON records (no raw ANSI/table)', async () => {
    const stdout = await captureLoadConfig([probeParam]);

    const lines = stdout.split('\n').filter((line) => line.length > 0);
    assert.ok(lines.length > 0, 'expected at least one log line');
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `each line must be valid JSON: ${line}`);
      assert.ok(!line.includes('\x1b['), 'no ANSI escapes in JSON output');
    }
  });

  it('emits the configuration summary as a single structured event', async () => {
    const summary = findSummary(await captureLoadConfig([probeParam]));

    assert.strictEqual(summary.message, 'Configuration summary');
    const configuration = summary.data?.configuration;
    assert.ok(configuration !== undefined, 'summary carries structured configuration data');
    const entry = configuration['probe.value'];
    assert.ok(entry !== undefined, 'probe.value present in summary');
    assert.strictEqual(entry.value, 'v');
    assert.strictEqual(typeof entry.source, 'string');
  });

  it('keeps {value,source} shape for sensitive-named params and redacts their values', async () => {
    const stdout = await captureLoadConfig([
      probeParam,
      {
        name: 'slack.token',
        type: GOConfigParameterType.STRING,
        description: 'slack token',
        required: false,
        sensitive: true,
        defaultValue: 'xoxb-raw-secret-value',
      },
    ]);

    const summary = findSummary(stdout);
    const configuration = summary.data?.configuration;
    assert.ok(configuration !== undefined);

    const tokenEntry = configuration['slack.token'];
    // The entry must remain a structured object (not collapsed to the '[REDACTED]' string),
    // so the source stays queryable even though the parameter name looks sensitive.
    assert.ok(tokenEntry !== undefined, 'slack.token present as a structured entry');
    assert.strictEqual(tokenEntry.value, '[REDACTED]');
    assert.strictEqual(typeof tokenEntry.source, 'string');
    assert.ok(tokenEntry.source.length > 0, 'source is preserved');
    // The secret value itself must not leak.
    assert.ok(!stdout.includes('xoxb-raw-secret-value'), 'raw secret value must not appear in logs');
  });

  it('redacts values for sensitive-looking parameter names even without sensitive flag', async () => {
    const stdout = await captureLoadConfig([
      {
        name: 'api.token',
        type: GOConfigParameterType.STRING,
        description: 'api token',
        required: false,
        defaultValue: 'raw-token-value',
      },
    ]);

    const summary = findSummary(stdout);
    const tokenEntry = summary.data?.configuration?.['api.token'];

    assert.ok(tokenEntry !== undefined, 'api.token present as a structured entry');
    assert.strictEqual(tokenEntry.value, '[REDACTED]');
    assert.ok(!stdout.includes('raw-token-value'), 'raw token value must not appear in logs');
  });
});
