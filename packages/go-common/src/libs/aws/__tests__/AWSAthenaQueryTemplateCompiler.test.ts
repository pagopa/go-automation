import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AWSAthenaQueryTemplateCompiler } from '../AWSAthenaQueryTemplateCompiler.js';

describe('AWSAthenaQueryTemplateCompiler', () => {
  it('compiles parameterized, range, now and raw placeholders', () => {
    const compiler = new AWSAthenaQueryTemplateCompiler();
    const compiled = compiler.compile({
      template:
        'select * from {{raw.table}} where id = {{param.id}} and ts >= {{range.start.dateTime}} and yyyy = {{now.year}}',
      values: { id: '42' },
      rawValues: { table: 'analytics.events' },
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-05-02T00:00:00Z'),
      now: new Date('2026-05-03T10:00:00Z'),
      timeZone: 'UTC',
    });

    assert.strictEqual(compiled.query, 'select * from analytics.events where id = ? and ts >= ? and yyyy = ?');
    assert.deepStrictEqual(compiled.parameters, ['42', '2026-05-01 00:00:00', '2026']);
    assert.deepStrictEqual(compiled.usedPlaceholders, [
      'raw.table',
      'param.id',
      'range.start.dateTime',
      'now.year',
    ]);
  });

  it('keeps legacy adjacent date aliases inline for TPP-compatible partitions', () => {
    const compiler = new AWSAthenaQueryTemplateCompiler();
    const compiled = compiler.compile({
      template: "where CONCAT(p_year,p_month,p_day,p_hour) >= '{{startYear}}{{startMonth}}{{startDay}}{{startHour}}'",
      from: new Date('2026-05-01T03:00:00Z'),
      to: new Date('2026-05-01T04:00:00Z'),
      timeZone: 'UTC',
    });

    assert.strictEqual(compiled.query, "where CONCAT(p_year,p_month,p_day,p_hour) >= '2026050103'");
    assert.deepStrictEqual(compiled.parameters, []);
  });

  it('rejects unknown and unsafe raw placeholders', () => {
    const compiler = new AWSAthenaQueryTemplateCompiler();

    assert.throws(() => compiler.compile({ template: 'select {{missing}}' }), /Unknown Athena query placeholder/);
    assert.throws(
      () =>
        compiler.compile({
          template: 'select * from {{raw.table}}',
          rawValues: { table: 'events; drop table users' },
        }),
      /Unsafe raw Athena query placeholder value/,
    );
  });
});
