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

  it('emits single-line JSON records only, including the structured summary and per-parameter events', async () => {
    const stdout = await captureLoadConfig([probeParam]);

    const lines = stdout.split('\n').filter((line) => line.length > 0);
    assert.ok(lines.length > 0, 'expected at least one log line');
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `each line must be valid JSON: ${line}`);
      assert.ok(!line.includes('\x1b['), 'no ANSI escapes in JSON output');
    }

    const summary = findSummary(stdout);
    assert.strictEqual(summary.eventType, 'configuration_summary');
    assert.strictEqual(summary.configurationCount, 1);
    const entry = summary.data?.configuration?.['probe.value'];
    assert.ok(entry !== undefined, 'probe.value present in summary');
    assert.strictEqual(entry.value, 'v');
    assert.strictEqual(typeof entry.source, 'string');

    const parameterRecord = findConfigurationParameter(stdout, 'probe.value');
    assert.strictEqual(parameterRecord.message, 'Configuration parameter');
    assert.strictEqual(parameterRecord.value, 'v');
    assert.strictEqual(typeof parameterRecord.source, 'string');
    assert.strictEqual(parameterRecord.data?.parameter, 'probe.value');
  });

  it('redacts sensitive and sensitive-looking parameters, keeping their {value,source} shape', async () => {
    const cases: ReadonlyArray<readonly [string, GOConfigParameterOptions]> = [
      [
        'slack.token',
        {
          name: 'slack.token',
          type: GOConfigParameterType.STRING,
          description: 'slack token',
          required: false,
          sensitive: true,
          defaultValue: 'xoxb-raw-secret-value',
        },
      ],
      // No sensitive flag: the name alone marks it.
      [
        'api.token',
        {
          name: 'api.token',
          type: GOConfigParameterType.STRING,
          description: 'api token',
          required: false,
          defaultValue: 'raw-token-value',
        },
      ],
    ];

    for (const [name, parameter] of cases) {
      const stdout = await captureLoadConfig([probeParam, parameter]);

      // The entry must remain a structured object (not collapsed to the '[REDACTED]' string),
      // so the source stays queryable even though the parameter name looks sensitive.
      const entry = findSummary(stdout).data?.configuration?.[name];
      assert.ok(entry !== undefined, `${name} present as a structured entry`);
      assert.strictEqual(entry.value, '[REDACTED]');
      assert.ok(entry.source.length > 0, 'source is preserved');

      const parameterRecord = findConfigurationParameter(stdout, name);
      assert.strictEqual(parameterRecord.value, '[REDACTED]');
      assert.strictEqual(typeof parameterRecord.source, 'string');
      assert.ok(!stdout.includes(String(parameter.defaultValue)), `the raw value of ${name} must not leak`);
    }
  });
});
