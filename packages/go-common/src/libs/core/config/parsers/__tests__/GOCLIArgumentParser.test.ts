import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOCLIArgumentParser } from '../GOCLIArgumentParser.js';

describe('GOCLIArgumentParser', () => {
  it('parses flags, inline values, booleans, short aliases and repeated arrays', () => {
    const parsed = GOCLIArgumentParser.parse([
      'positional',
      '',
      '--name=Massimo',
      '--dry-run',
      '--tags',
      'one,two',
      '--values',
      'alpha',
      'beta,gamma',
      '-s',
      'short',
      '--tags',
      'three',
      '--empty=',
      '--lonely',
    ]);

    assert.deepStrictEqual(
      parsed,
      new Map<string, string | string[]>([
        ['name', 'Massimo'],
        ['dry-run', 'true'],
        ['tags', ['one', 'two', 'three']],
        ['values', ['alpha', 'beta', 'gamma']],
        ['s', 'short'],
        ['empty', ''],
        ['lonely', 'true'],
      ]),
    );
  });

  it('parses with schema booleans and merges inline and positional values', () => {
    const parsed = GOCLIArgumentParser.parseWithSchema(
      [
        '--dry-run=false',
        '--include',
        'a,b',
        '--include',
        'c',
        'd',
        '--implicit-boolean',
        '--skip',
        '--name',
        'single',
        '-x=1',
      ],
      {
        booleanFlags: ['dry-run', 'skip'],
        arrayFlags: ['include'],
      },
    );

    assert.deepStrictEqual(
      parsed,
      new Map<string, string | string[]>([
        ['dry-run', 'false'],
        ['include', ['a', 'b', 'c', 'd']],
        ['implicit-boolean', 'true'],
        ['skip', 'true'],
        ['name', 'single'],
        ['x', '1'],
      ]),
    );
  });
});
