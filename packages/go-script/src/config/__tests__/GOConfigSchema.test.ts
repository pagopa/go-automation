import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOConfigReader } from '../GOConfigReader.js';
import { GOConfigSchema } from '../GOConfigSchema.js';
import { GOConfigParameterType } from '../GOConfigParameterType.js';
import { GOInMemoryConfigProvider } from '../providers/GOInMemoryConfigProvider.js';

function createReader(values: Record<string, string | string[]>): GOConfigReader {
  return new GOConfigReader([new GOInMemoryConfigProvider({ values })]);
}

describe('GOConfigSchema', () => {
  it('adds parameters and exposes groups, required, optional and CLI lookup helpers', () => {
    const schema = new GOConfigSchema({ name: 'Import schema', version: '2.1.0' });
    const input = schema.addParameter({
      name: 'input.file',
      type: GOConfigParameterType.STRING,
      required: true,
      group: 'Input',
      aliases: ['-i'],
    });
    schema.addParameters([
      {
        name: 'dry.run',
        type: GOConfigParameterType.BOOL,
        group: 'Execution',
      },
    ]);

    assert.strictEqual(schema.getParameter('input.file'), input);
    assert.deepStrictEqual(schema.getAllGroups(), ['Execution', 'Input']);
    assert.deepStrictEqual(
      schema.getParametersByGroup('Input').map((p) => p.name),
      ['input.file'],
    );
    assert.deepStrictEqual(
      schema.getRequiredParameters().map((p) => p.name),
      ['input.file'],
    );
    assert.deepStrictEqual(
      schema.getOptionalParameters().map((p) => p.name),
      ['dry.run'],
    );
    assert.strictEqual(schema.findByCliFlag('--input-file')?.name, 'input.file');
    assert.strictEqual(schema.findByCliFlag('-i')?.name, 'input.file');
    assert.strictEqual(schema.findByCliFlag('--missing'), undefined);
  });

  it('loads and validates typed configuration values', () => {
    const schema = new GOConfigSchema();
    schema.addParameters([
      {
        name: 'input.file',
        type: GOConfigParameterType.STRING,
        required: true,
      },
      {
        name: 'limit',
        type: GOConfigParameterType.INT,
        defaultValue: 10,
        validator: (value) => (typeof value === 'number' && value > 0 ? true : 'limit must be positive'),
      },
      {
        name: 'dry.run',
        type: GOConfigParameterType.BOOL,
      },
    ]);

    const validReader = createReader({ 'input.file': 'input.json', 'dry.run': 'true' });
    assert.deepStrictEqual(schema.loadConfig(validReader), {
      'input.file': 'input.json',
      limit: 10,
      'dry.run': true,
    });
    assert.deepStrictEqual(schema.validate(validReader), { valid: true, errors: [] });

    const invalidReader = createReader({ 'input.file': 'input.json', limit: '-1' });
    assert.throws(() => schema.loadConfig(invalidReader), /limit: limit must be positive/);
    assert.deepStrictEqual(schema.validate(invalidReader), {
      valid: false,
      errors: ['limit: limit must be positive'],
    });
  });

  it('reports missing required parameters during load and validation', () => {
    const schema = new GOConfigSchema();
    schema.addParameter({
      name: 'required.value',
      type: GOConfigParameterType.STRING,
      required: true,
    });

    const reader = createReader({});
    assert.throws(() => schema.loadConfig(reader), /required\.value: Required parameter "required\.value" is missing/);
    assert.deepStrictEqual(schema.validate(reader), {
      valid: false,
      errors: ['required.value: Required parameter "required.value" is missing'],
    });
  });

  it('generates help, compact help, parameter help and usage strings', () => {
    const schema = new GOConfigSchema({
      programName: 'go-import',
      showProgramInfos: true,
      description: 'Imports notifications',
    });
    schema.addParameter({
      name: 'csv.file',
      type: GOConfigParameterType.STRING,
      required: true,
      abstract: 'CSV input',
      description: 'CSV file to import',
    });

    assert.match(schema.generateHelp(), /go-import v1\.0\.0/);
    assert.match(schema.generateCompactHelp(), /--csv-file <value>\s+CSV input/);
    assert.match(schema.generateParameterHelp('csv.file') ?? '', /CSV file to import/);
    assert.strictEqual(schema.generateParameterHelp('missing'), undefined);
    assert.strictEqual(schema.getUsageString(), 'go-import --csv-file <value>');
  });

  it('handles help flags and writes help output', () => {
    const schema = new GOConfigSchema({ programName: 'go-tool' });
    schema.addParameter({
      name: 'value',
      type: GOConfigParameterType.STRING,
      abstract: 'A value',
    });

    assert.strictEqual(GOConfigSchema.hasHelpFlag(['run']), false);
    assert.strictEqual(GOConfigSchema.hasHelpFlag(['run', '--help']), true);
    assert.strictEqual(GOConfigSchema.hasHelpFlag(['help']), true);

    let output = '';
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      output += String(chunk);
      return true;
    };

    try {
      assert.strictEqual(schema.handleHelpFlag(['run']), false);
      assert.strictEqual(output, '');
      assert.strictEqual(schema.handleHelpFlag(['--help']), true);
      schema.printCompactHelp();
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.match(output, /--value <value>/);
  });

  it('serializes to JSON and markdown documentation', () => {
    const schema = new GOConfigSchema({ name: 'Documented schema', version: '3.0.0' });
    schema.addParameter({
      name: 'old.flag',
      type: GOConfigParameterType.BOOL,
      abstract: 'Old flag',
      description: 'Legacy option',
      help: '--old-flag',
      group: 'Flags',
      deprecated: true,
      deprecationMessage: 'Use new.flag instead.',
      sensitive: true,
    });

    assert.deepStrictEqual(schema.toJSON(), {
      name: 'Documented schema',
      version: '3.0.0',
      parameters: [
        {
          name: 'old.flag',
          displayName: 'Old Flag',
          type: 'bool',
          group: 'Flags',
          required: false,
          defaultValue: undefined,
          abstract: 'Old flag',
          description: 'Legacy option',
          cliFlag: '--old-flag',
          envVar: 'OLD_FLAG',
          aliases: [],
          deprecated: true,
          sensitive: true,
          reserved: false,
        },
      ],
    });

    const markdown = schema.toMarkdown();
    assert.match(markdown, /# Documented schema/);
    assert.match(markdown, /## Table of Contents/);
    assert.match(markdown, /### Old Flag/);
    assert.match(markdown, /> ⚠️ \*\*DEPRECATED\*\*/);
    assert.match(markdown, /Use new\.flag instead\./);
  });

  it('allows reserved parameters and rejects reserved conflicts with existing identifiers', () => {
    const schema = new GOConfigSchema();
    schema.addParameter({
      name: 'preset.name',
      type: GOConfigParameterType.STRING,
      aliases: ['preset'],
    });

    assert.throws(
      () =>
        schema.addReservedParameters([
          {
            name: 'preset.name',
            type: GOConfigParameterType.STRING,
          },
        ]),
      /Reserved parameter "preset\.name" conflicts with an existing script parameter/,
    );

    assert.throws(
      () =>
        schema.addReservedParameters([
          {
            name: 'system.preset',
            type: GOConfigParameterType.STRING,
            aliases: ['preset'],
          },
        ]),
      /alias "preset" conflicts with existing script parameter "preset\.name" alias "preset"/,
    );

    assert.throws(
      () =>
        schema.addReservedParameters([
          {
            name: 'system.flag',
            type: GOConfigParameterType.STRING,
            cliFlag: '--preset-name',
          },
        ]),
      /CLI flag "preset-name" conflicts with existing script parameter "preset\.name" CLI flag "preset-name"/,
    );

    const validSchema = new GOConfigSchema();
    validSchema.addParameter({
      name: 'input.file',
      type: GOConfigParameterType.STRING,
      group: 'Input',
    });
    validSchema.addReservedParameters([
      {
        name: 'system.preset',
        type: GOConfigParameterType.STRING,
        group: 'System',
        cliFlag: '--system-preset',
        aliases: ['reserved-preset'],
      },
    ]);

    assert.deepStrictEqual(
      validSchema.getAllParameters().map((p) => p.name),
      ['input.file', 'system.preset'],
    );
    assert.strictEqual(validSchema.getParameter('system.preset')?.reserved, true);
    assert.strictEqual(validSchema.findByCliFlag('--system-preset')?.name, 'system.preset');
    assert.deepStrictEqual(
      validSchema.getParametersByGroup('System').map((p) => p.name),
      ['system.preset'],
    );
  });
});
