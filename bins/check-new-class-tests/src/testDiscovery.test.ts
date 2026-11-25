import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { findTestForClass } from './testDiscovery.js';

/** A synchronous test body. */
type FixtureFn = () => void;

/** One discovery scenario: the test files on disk, the class under check and the expected outcome. */
interface DiscoveryCase {
  readonly name: string;
  readonly files: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly sourcePath: string;
  readonly className: string;
  readonly found: boolean;
  readonly expectedPaths?: ReadonlyArray<string>;
}

const CASES: ReadonlyArray<DiscoveryCase> = [
  {
    name: 'finds a direct __tests__ file matching the class name',
    files: { 'packages/direct-class/src/__tests__/Foo.test.ts': [] },
    sourcePath: 'packages/direct-class/src/Foo.ts',
    className: 'Foo',
    found: true,
    expectedPaths: ['packages/direct-class/src/__tests__/Foo.test.ts'],
  },
  {
    name: 'finds a direct __tests__ file matching the source file base name',
    files: { 'packages/direct-base/src/services/__tests__/FooService.test.ts': [] },
    sourcePath: 'packages/direct-base/src/services/FooService.ts',
    className: 'RenamedFoo',
    found: true,
    expectedPaths: [
      'packages/direct-base/src/services/__tests__/RenamedFoo.test.ts',
      'packages/direct-base/src/services/__tests__/FooService.test.ts',
    ],
  },
  {
    name: 'finds a class referenced as a real identifier in an existing package test',
    files: {
      'packages/go-common/src/__tests__/SomeOtherName.test.ts': [
        "import { describe, it } from 'node:test';",
        "import { Foo } from '../Foo.js';",
        "describe('Foo', () => {",
        "  it('uses Foo', () => assert.ok(Foo));",
        '});',
      ],
    },
    sourcePath: 'packages/go-common/src/Foo.ts',
    className: 'Foo',
    found: true,
  },
  {
    name: 'ignores class names found only in comments, strings, or other identifiers',
    files: {
      'packages/go-send/src/__tests__/Other.test.ts': [
        '// Bar should not be counted from a comment.',
        "const text = 'Bar should not be counted from a string';",
        'const Foobar = class {};',
        'assert.ok(Foobar);',
      ],
    },
    sourcePath: 'packages/go-send/src/Bar.ts',
    className: 'Bar',
    found: false,
  },
  {
    name: 'ignores class names found only as property names, object keys, declarations, or type members',
    files: {
      'packages/go-runbooks/src/__tests__/Other.test.ts': [
        'interface WithProperty {',
        '  Foo: string;',
        '  read(Foo: string): string;',
        '}',
        'type WithTypeProperty = { Foo: string };',
        'class Foo {}',
        'const obj = { Foo: 1 };',
        'assert.equal(obj.Foo, 1);',
      ],
    },
    sourcePath: 'packages/go-runbooks/src/Foo.ts',
    className: 'Foo',
    found: false,
  },
  {
    name: 'does not use fallback discovery when the package src root cannot be derived',
    files: { 'src/__tests__/SomeOtherName.test.ts': ["import { Foo } from '../Foo.js';", 'assert.ok(Foo);'] },
    sourcePath: 'src/Foo.ts',
    className: 'Foo',
    found: false,
    expectedPaths: ['src/__tests__/Foo.test.ts'],
  },
];

describe('findTestForClass', () => {
  for (const { name, files, sourcePath, className, found, expectedPaths } of CASES) {
    it(name, () => {
      inTemporaryDirectory(() => {
        writeFiles(files);

        const result = findTestForClass(sourcePath, className);

        assert.equal(result.found, found);
        if (expectedPaths !== undefined) assert.deepEqual(result.expectedPaths, expectedPaths);
      });
    });
  }

  it('does not reuse cached identifiers across different current working directories', () => {
    const testPath = 'packages/same-name/src/__tests__/Existing.test.ts';
    inTemporaryDirectory(() => {
      writeFiles({ [testPath]: ["import { Foo } from '../Foo.js';", 'assert.ok(Foo);'] });
      assert.equal(findTestForClass('packages/same-name/src/Foo.ts', 'Foo').found, true);
    });
    inTemporaryDirectory(() => {
      writeFiles({ [testPath]: ['assert.ok(true);'] });
      assert.equal(findTestForClass('packages/same-name/src/Foo.ts', 'Foo').found, false);
    });
  });
});

/**
 * Runs `run` with a fresh temporary directory as the current directory, then restores the
 * previous one and deletes the directory.
 *
 * @param run - The synchronous body to run inside the directory
 */
function inTemporaryDirectory(run: FixtureFn): void {
  const previousCwd = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-new-class-tests-'));

  try {
    process.chdir(root);
    run();
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Writes the given files, one line per array entry, relative to the current directory.
 *
 * @param files - Relative path to file lines
 */
function writeFiles(files: Readonly<Record<string, ReadonlyArray<string>>>): void {
  for (const [relativePath, lines] of Object.entries(files)) {
    const fullPath = path.resolve(relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, lines.length === 0 ? '' : `${lines.join('\n')}\n`);
  }
}
