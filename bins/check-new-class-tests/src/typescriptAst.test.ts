import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  findExportedClassesInAddedLines,
  findExportedClassName,
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
