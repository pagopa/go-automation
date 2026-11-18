import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  findExportedClassDeclarations,
  findExportedClassesInAddedLines,
  findExportedClassName,
  findModuleReExportsInAddedLines,
  findNamedReExportsInAddedLines,
} from './typescriptAst.js';

/** One table row: a source (one line per entry), the added lines and the expected result. */
interface AddedLinesCase<T> {
  readonly name: string;
  readonly source: ReadonlyArray<string>;
  readonly added: ReadonlyArray<number>;
  readonly expected: ReadonlyArray<T>;
}

describe('findExportedClassesInAddedLines', () => {
  const cases: ReadonlyArray<AddedLinesCase<{ readonly name: string; readonly line: number }>> = [
    {
      name: 'a directly exported class on an added line',
      source: ['const ignored = true;', 'export class Foo {}', 'class Internal {}'],
      added: [2, 3],
      expected: [{ name: 'Foo', line: 2 }],
    },
    {
      name: 'a new class exported by a named export declaration',
      source: ['class Foo {}', 'export { Foo };'],
      added: [1, 2],
      expected: [{ name: 'Foo', line: 1 }],
    },
    {
      name: 'an existing class made public by an added named export declaration',
      source: ['class Foo {}', 'export { Foo };'],
      added: [2],
      expected: [{ name: 'Foo', line: 2 }],
    },
    {
      name: 'an existing class made public by an added specifier in a multiline export',
      source: ['class Foo {}', 'class Bar {}', 'export {', '  Bar,', '  Foo,', '};'],
      added: [5],
      expected: [{ name: 'Foo', line: 5 }],
    },
    {
      name: 'an existing class made public by an added default export assignment',
      source: ['class Foo {}', 'export default Foo;'],
      added: [2],
      expected: [{ name: 'Foo', line: 2 }],
    },
    {
      name: 'no type-only export declaration',
      source: ['class Foo {}', 'export type { Foo };'],
      added: [2],
      expected: [],
    },
    {
      name: 'no type-only export specifier',
      source: ['class Foo {}', 'export { type Foo };'],
      added: [2],
      expected: [],
    },
    {
      name: 'no exported class whose declaration line was not added',
      source: ['export class Foo {}', 'export class Bar {}'],
      added: [2],
      expected: [{ name: 'Bar', line: 2 }],
    },
  ];

  for (const { name, source, added, expected } of cases) {
    it(`finds ${name}`, () => {
      assert.deepStrictEqual(findExportedClassesInAddedLines('Foo.ts', source.join('\n'), new Set(added)), expected);
    });
  }
});

describe('findNamedReExportsInAddedLines', () => {
  const foo = (sourceName: string, line: number): Readonly<Record<string, unknown>> => ({
    exportedName: 'Foo',
    sourceName,
    moduleSpecifier: './Foo.js',
    line,
  });
  const cases: ReadonlyArray<AddedLinesCase<Readonly<Record<string, unknown>>>> = [
    { name: 'a named re-export', source: ["export { Foo } from './Foo.js';"], added: [1], expected: [foo('Foo', 1)] },
    {
      name: 'the added specifier of a multiline re-export',
      source: ['export {', '  Bar,', '  Foo,', "} from './Foo.js';"],
      added: [3],
      expected: [foo('Foo', 3)],
    },
    {
      name: 'the source and exported names of an aliased re-export',
      source: ["export { default as Foo } from './Foo.js';"],
      added: [1],
      expected: [foo('default', 1)],
    },
    { name: 'no type-only re-export', source: ["export type { Foo } from './Foo.js';"], added: [1], expected: [] },
    { name: 'no type-only specifier', source: ["export { type Foo } from './Foo.js';"], added: [1], expected: [] },
  ];

  for (const { name, source, added, expected } of cases) {
    it(`finds ${name}`, () => {
      assert.deepStrictEqual(findNamedReExportsInAddedLines('index.ts', source.join('\n'), new Set(added)), expected);
    });
  }
});

describe('findModuleReExportsInAddedLines', () => {
  const cases: ReadonlyArray<AddedLinesCase<{ readonly moduleSpecifier: string; readonly line: number }>> = [
    {
      name: 'an export-star declaration',
      source: ["export * from './Foo.js';"],
      added: [1],
      expected: [{ moduleSpecifier: './Foo.js', line: 1 }],
    },
    {
      name: 'a namespace re-export',
      source: ["export * as FooModule from './Foo.js';"],
      added: [1],
      expected: [{ moduleSpecifier: './Foo.js', line: 1 }],
    },
    {
      name: 'no named re-export (handled separately)',
      source: ["export { Foo } from './Foo.js';"],
      added: [1],
      expected: [],
    },
    { name: 'no type-only module re-export', source: ["export type * from './Foo.js';"], added: [1], expected: [] },
  ];

  for (const { name, source, added, expected } of cases) {
    it(`finds ${name}`, () => {
      assert.deepStrictEqual(findModuleReExportsInAddedLines('index.ts', source.join('\n'), new Set(added)), expected);
    });
  }
});

describe('findExportedClassDeclarations', () => {
  it('finds all runtime exported class declarations in a module', () => {
    const source = [
      'export class Foo {}',
      'class Bar {}',
      'export { Bar };',
      'class Internal {}',
      'export default class DefaultFoo {}',
    ].join('\n');

    assert.deepStrictEqual(findExportedClassDeclarations('Foo.ts', source), [
      { name: 'Foo', line: 1 },
      { name: 'Bar', line: 2 },
      { name: 'DefaultFoo', line: 5 },
    ]);
  });
});

describe('findExportedClassName', () => {
  const cases: ReadonlyArray<readonly [string, string, string, string | undefined]> = [
    ['a class exported by name', 'export class Foo {}', 'Foo', 'Foo'],
    ['a class exported through a same-file export declaration', 'class Foo {}\nexport { Foo };', 'Foo', 'Foo'],
    ['a default exported class through an aliased re-export', 'export default class Foo {}', 'default', 'Foo'],
    ['no class that is not exported', 'class Foo {}', 'Foo', undefined],
  ];

  for (const [name, source, sourceName, expected] of cases) {
    it(`finds ${name}`, () => {
      assert.equal(findExportedClassName('Foo.ts', source, sourceName, 'Foo'), expected);
    });
  }
});
