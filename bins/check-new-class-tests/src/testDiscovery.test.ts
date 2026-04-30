import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { findTestForClass } from './testDiscovery.js';

type FixtureFn = () => void;

describe('findTestForClass', () => {
  it('finds a direct __tests__ file matching the class name', () => {
    withFixture('direct-class-name', () => {
      writeFile('packages/direct-class/src/__tests__/Foo.test.ts', '');

      const result = findTestForClass('packages/direct-class/src/Foo.ts', 'Foo');

      assert.equal(result.found, true);
      assert.deepEqual(result.expectedPaths, ['packages/direct-class/src/__tests__/Foo.test.ts']);
    });
  });

  it('finds a direct __tests__ file matching the source file base name', () => {
    withFixture('direct-base-name', () => {
      writeFile('packages/direct-base/src/services/__tests__/FooService.test.ts', '');

      const result = findTestForClass('packages/direct-base/src/services/FooService.ts', 'RenamedFoo');

      assert.equal(result.found, true);
      assert.deepEqual(result.expectedPaths, [
        'packages/direct-base/src/services/__tests__/RenamedFoo.test.ts',
        'packages/direct-base/src/services/__tests__/FooService.test.ts',
      ]);
    });
  });

  it('finds a class referenced as a real identifier in an existing package test', () => {
    withFixture('identifier-reference', () => {
      writeFile(
        'packages/go-common/src/__tests__/SomeOtherName.test.ts',
        [
          "import { describe, it } from 'node:test';",
          "import { Foo } from '../Foo.js';",
          '',
          "describe('Foo', () => {",
          "  it('uses Foo', () => assert.ok(Foo));",
          '});',
          '',
        ].join('\n'),
      );

      const result = findTestForClass('packages/go-common/src/Foo.ts', 'Foo');

      assert.equal(result.found, true);
    });
  });

  it('ignores class names found only in comments, strings, or other identifiers', () => {
    withFixture('false-positives', () => {
      writeFile(
        'packages/go-send/src/__tests__/Other.test.ts',
        [
          "import { describe, it } from 'node:test';",
          '',
          '// Bar should not be counted from a comment.',
          "const text = 'Bar should not be counted from a string';",
          'const Foobar = class {};',
          '',
          "describe('Other', () => {",
          "  it('does not reference the class', () => assert.ok(Foobar));",
          '});',
          '',
        ].join('\n'),
      );

      const result = findTestForClass('packages/go-send/src/Bar.ts', 'Bar');

      assert.equal(result.found, false);
    });
  });

  it('ignores class names found only as property names, object keys, declarations, or type members', () => {
    withFixture('non-value-identifiers', () => {
      writeFile(
        'packages/go-runbooks/src/__tests__/Other.test.ts',
        [
          "import { describe, it } from 'node:test';",
          '',
          'interface WithProperty {',
          '  Foo: string;',
          '  read(Foo: string): string;',
          '}',
          '',
          'type WithTypeProperty = { Foo: string };',
          'class Foo {}',
          'const obj = { Foo: 1 };',
          '',
          "describe('Other', () => {",
          "  it('does not reference the class under test', () => assert.equal(obj.Foo, 1));",
          '});',
          '',
        ].join('\n'),
      );

      const result = findTestForClass('packages/go-runbooks/src/Foo.ts', 'Foo');

      assert.equal(result.found, false);
    });
  });

  it('does not use fallback discovery when the package src root cannot be derived', () => {
    withFixture('outside-package-src', () => {
      writeFile(
        'src/__tests__/SomeOtherName.test.ts',
        ["import { Foo } from '../Foo.js';", 'assert.ok(Foo);', ''].join('\n'),
      );

      const result = findTestForClass('src/Foo.ts', 'Foo');

      assert.equal(result.found, false);
      assert.deepEqual(result.expectedPaths, ['src/__tests__/Foo.test.ts']);
    });
  });
});

function withFixture(name: string, run: FixtureFn): void {
  const previousCwd = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `check-new-class-tests-${name}-`));

  try {
    process.chdir(root);
    run();
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFile(relativePath: string, content: string): void {
  const fullPath = path.resolve(relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}
