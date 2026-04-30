import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  findExportedClassDeclarations,
  findExportedClassesInAddedLines,
  findExportedClassName,
  findModuleReExportsInAddedLines,
  findNamedReExportsInAddedLines,
} from './typescriptAst.js';

describe('findExportedClassesInAddedLines', () => {
  it('finds directly exported classes on added lines', () => {
    const source = ['const ignored = true;', 'export class Foo {}', 'class Internal {}'].join('\n');

    const classes = findExportedClassesInAddedLines('Foo.ts', source, new Set([2, 3]));

    assert.deepStrictEqual(classes, [{ name: 'Foo', line: 2 }]);
  });

  it('finds new classes exported by named export declarations', () => {
    const source = ['class Foo {}', 'export { Foo };'].join('\n');

    const classes = findExportedClassesInAddedLines('Foo.ts', source, new Set([1, 2]));

    assert.deepStrictEqual(classes, [{ name: 'Foo', line: 1 }]);
  });

  it('finds existing classes made public by an added named export declaration', () => {
    const source = ['class Foo {}', 'export { Foo };'].join('\n');

    const classes = findExportedClassesInAddedLines('Foo.ts', source, new Set([2]));

    assert.deepStrictEqual(classes, [{ name: 'Foo', line: 2 }]);
  });

  it('finds existing classes made public by an added specifier in a multiline export declaration', () => {
    const source = ['class Foo {}', 'class Bar {}', 'export {', '  Bar,', '  Foo,', '};'].join('\n');

    const classes = findExportedClassesInAddedLines('Foo.ts', source, new Set([5]));

    assert.deepStrictEqual(classes, [{ name: 'Foo', line: 5 }]);
  });

  it('finds existing classes made public by an added default export assignment', () => {
    const source = ['class Foo {}', 'export default Foo;'].join('\n');

    const classes = findExportedClassesInAddedLines('Foo.ts', source, new Set([2]));

    assert.deepStrictEqual(classes, [{ name: 'Foo', line: 2 }]);
  });

  it('ignores type-only export declarations when finding newly public classes', () => {
    const source = ['class Foo {}', 'export type { Foo };'].join('\n');

    const classes = findExportedClassesInAddedLines('Foo.ts', source, new Set([2]));

    assert.deepStrictEqual(classes, []);
  });

  it('ignores type-only export specifiers when finding newly public classes', () => {
    const source = ['class Foo {}', 'export { type Foo };'].join('\n');

    const classes = findExportedClassesInAddedLines('Foo.ts', source, new Set([2]));

    assert.deepStrictEqual(classes, []);
  });

  it('ignores exported classes whose class declaration line was not added', () => {
    const source = ['export class Foo {}', 'export class Bar {}'].join('\n');

    const classes = findExportedClassesInAddedLines('Foo.ts', source, new Set([2]));

    assert.deepStrictEqual(classes, [{ name: 'Bar', line: 2 }]);
  });
});

describe('findNamedReExportsInAddedLines', () => {
  it('finds named re-exports on added lines', () => {
    const source = ["export { Foo } from './Foo.js';"].join('\n');

    const reExports = findNamedReExportsInAddedLines('index.ts', source, new Set([1]));

    assert.deepStrictEqual(reExports, [
      {
        exportedName: 'Foo',
        sourceName: 'Foo',
        moduleSpecifier: './Foo.js',
        line: 1,
      },
    ]);
  });

  it('finds added specifiers in multiline re-export declarations', () => {
    const source = ['export {', '  Bar,', '  Foo,', "} from './Foo.js';"].join('\n');

    const reExports = findNamedReExportsInAddedLines('index.ts', source, new Set([3]));

    assert.deepStrictEqual(reExports, [
      {
        exportedName: 'Foo',
        sourceName: 'Foo',
        moduleSpecifier: './Foo.js',
        line: 3,
      },
    ]);
  });

  it('keeps source and exported names for aliased re-exports', () => {
    const source = ["export { default as Foo } from './Foo.js';"].join('\n');

    const reExports = findNamedReExportsInAddedLines('index.ts', source, new Set([1]));

    assert.deepStrictEqual(reExports, [
      {
        exportedName: 'Foo',
        sourceName: 'default',
        moduleSpecifier: './Foo.js',
        line: 1,
      },
    ]);
  });

  it('ignores type-only re-export declarations', () => {
    const source = ["export type { Foo } from './Foo.js';"].join('\n');

    const reExports = findNamedReExportsInAddedLines('index.ts', source, new Set([1]));

    assert.deepStrictEqual(reExports, []);
  });

  it('ignores type-only re-export specifiers', () => {
    const source = ["export { type Foo } from './Foo.js';"].join('\n');

    const reExports = findNamedReExportsInAddedLines('index.ts', source, new Set([1]));

    assert.deepStrictEqual(reExports, []);
  });
});

describe('findModuleReExportsInAddedLines', () => {
  it('finds added export-star declarations', () => {
    const source = ["export * from './Foo.js';"].join('\n');

    const reExports = findModuleReExportsInAddedLines('index.ts', source, new Set([1]));

    assert.deepStrictEqual(reExports, [
      {
        moduleSpecifier: './Foo.js',
        line: 1,
      },
    ]);
  });

  it('finds added namespace re-export declarations', () => {
    const source = ["export * as FooModule from './Foo.js';"].join('\n');

    const reExports = findModuleReExportsInAddedLines('index.ts', source, new Set([1]));

    assert.deepStrictEqual(reExports, [
      {
        moduleSpecifier: './Foo.js',
        line: 1,
      },
    ]);
  });

  it('ignores named re-exports because they are handled separately', () => {
    const source = ["export { Foo } from './Foo.js';"].join('\n');

    const reExports = findModuleReExportsInAddedLines('index.ts', source, new Set([1]));

    assert.deepStrictEqual(reExports, []);
  });

  it('ignores type-only module re-exports', () => {
    const source = ["export type * from './Foo.js';"].join('\n');

    const reExports = findModuleReExportsInAddedLines('index.ts', source, new Set([1]));

    assert.deepStrictEqual(reExports, []);
  });
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

    const classes = findExportedClassDeclarations('Foo.ts', source);

    assert.deepStrictEqual(classes, [
      { name: 'Foo', line: 1 },
      { name: 'Bar', line: 2 },
      { name: 'DefaultFoo', line: 5 },
    ]);
  });
});

describe('findExportedClassName', () => {
  it('finds a class exported by name', () => {
    const source = ['export class Foo {}'].join('\n');

    const className = findExportedClassName('Foo.ts', source, 'Foo', 'Foo');

    assert.equal(className, 'Foo');
  });

  it('finds a class exported through a same-file export declaration', () => {
    const source = ['class Foo {}', 'export { Foo };'].join('\n');

    const className = findExportedClassName('Foo.ts', source, 'Foo', 'Foo');

    assert.equal(className, 'Foo');
  });

  it('finds a default exported class through an aliased re-export', () => {
    const source = ['export default class Foo {}'].join('\n');

    const className = findExportedClassName('Foo.ts', source, 'default', 'Foo');

    assert.equal(className, 'Foo');
  });

  it('ignores non-exported classes', () => {
    const source = ['class Foo {}'].join('\n');

    const className = findExportedClassName('Foo.ts', source, 'Foo', 'Foo');

    assert.equal(className, undefined);
  });
});
