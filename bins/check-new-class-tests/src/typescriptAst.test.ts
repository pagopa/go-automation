import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { findExportedClassesInAddedLines } from './typescriptAst.js';

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
