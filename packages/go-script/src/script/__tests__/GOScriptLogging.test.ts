import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOConfigParameterOptions } from '../../config/GOConfigParameter.js';
import { GOConfigParameterType } from '../../config/GOConfigParameterType.js';
import { GOScript } from '../GOScript.js';

interface ConfigSummaryEntry {
  readonly value: string;
  readonly source: string;
}

interface LogRecordData {
  readonly configuration?: Record<string, ConfigSummaryEntry>;
  readonly configurationCount?: number;
  readonly eventType?: string;
  readonly parameter?: string;
  readonly value?: string;
  readonly source?: string;
}

interface JsonLogRecord {
  readonly message?: string;
  readonly level?: string;
  readonly eventType?: string;
  readonly configurationCount?: number;
  readonly parameter?: string;
  readonly value?: string;
  readonly source?: string;
  readonly data?: LogRecordData;
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

  function parseRecords(stdout: string): JsonLogRecord[] {
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JsonLogRecord);
  }

  function findSummary(stdout: string): JsonLogRecord {
    const summary = parseRecords(stdout).find((record) => record.message === 'Configuration summary');
    assert.ok(summary !== undefined, 'configuration summary event present');
    return summary;
  }

  function findConfigurationParameter(stdout: string, parameter: string): JsonLogRecord {
    const parameterRecord = parseRecords(stdout).find(
      (record) => record.eventType === 'configuration_parameter' && record.parameter === parameter,
    );
    assert.ok(parameterRecord !== undefined, `configuration parameter event present for ${parameter}`);
    return parameterRecord;
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
    assert.strictEqual(summary.eventType, 'configuration_summary');
    assert.strictEqual(summary.configurationCount, 1);
    const configuration = summary.data?.configuration;
    assert.ok(configuration !== undefined, 'summary carries structured configuration data');
    const entry = configuration['probe.value'];
    assert.ok(entry !== undefined, 'probe.value present in summary');
    assert.strictEqual(entry.value, 'v');
    assert.strictEqual(typeof entry.source, 'string');
  });

  it('emits queryable configuration parameter events with top-level fields', async () => {
    const parameterRecord = findConfigurationParameter(await captureLoadConfig([probeParam]), 'probe.value');

    assert.strictEqual(parameterRecord.message, 'Configuration parameter');
    assert.strictEqual(parameterRecord.eventType, 'configuration_parameter');
    assert.strictEqual(parameterRecord.parameter, 'probe.value');
    assert.strictEqual(parameterRecord.value, 'v');
    assert.strictEqual(typeof parameterRecord.source, 'string');
    assert.strictEqual(parameterRecord.data?.parameter, 'probe.value');
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

    const parameterRecord = findConfigurationParameter(stdout, 'slack.token');
    assert.strictEqual(parameterRecord.value, '[REDACTED]');
    assert.strictEqual(typeof parameterRecord.source, 'string');
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

    const parameterRecord = findConfigurationParameter(stdout, 'api.token');
    assert.strictEqual(parameterRecord.value, '[REDACTED]');
    assert.ok(!stdout.includes('raw-token-value'), 'raw token value must not appear in logs');
  });
});
