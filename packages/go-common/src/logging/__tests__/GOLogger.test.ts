import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogger } from '../GOLogger.js';
import { GOLogEventCategory } from '../GOLogEventCategory.js';
import { RecordingLoggerHandler } from './helpers/RecordingLoggerHandler.js';

/** A logger call whose emitted lines are collected. */
type LogActionFn = () => void;

/** GOLogger seen without its overload typing, to reach the runtime argument guard. */
interface UntypedLogger {
  log(category: GOLogEventCategory): void;
}

describe('GOLogger', () => {
  it('distributes events to every registered handler until it is unregistered', () => {
    const first = new RecordingLoggerHandler();
    const second = new RecordingLoggerHandler();
    const logger = new GOLogger([first]);
    logger.registerHandler(second);
    assert.deepStrictEqual(logger.getHandlers(), [first, second]);

    logger.info('both');
    logger.unregisterHandler(second);
    logger.unregisterHandler(second); // not registered anymore: no-op
    logger.info('first only');

    assert.deepStrictEqual(
      first.events.map((e) => e.message),
      ['both', 'first only'],
    );
    assert.deepStrictEqual(
      second.events.map((e) => e.message),
      ['both'],
    );
  });

  it('logs by category and message, and rejects a category without message', () => {
    const handler = new RecordingLoggerHandler();
    const logger = new GOLogger();
    logger.registerHandler(handler);

    logger.log(GOLogEventCategory.SUCCESS, 'great success');

    assert.strictEqual(handler.events[0]?.message, 'great success');
    assert.strictEqual(handler.events[0]?.category, GOLogEventCategory.SUCCESS);
    // Forced call without message to reach the runtime guard.
    const untyped = logger as unknown as UntypedLogger;
    assert.throws(() => untyped.log(GOLogEventCategory.SUCCESS), /Invalid log arguments/);
  });

  it('maps each convenience method to its category', () => {
    const handler = new RecordingLoggerHandler();
    const logger = new GOLogger([handler]);

    logger.text('text');
    logger.newline();
    logger.step('step');
    logger.success('success');
    logger.error('error');
    logger.fatal('fatal');
    logger.warning('warning');
    logger.header('header');
    logger.info('info');
    logger.section('section');

    assert.deepStrictEqual(
      handler.events.map((e) => e.category),
      [
        GOLogEventCategory.TEXT,
        GOLogEventCategory.TEXT,
        GOLogEventCategory.STEP,
        GOLogEventCategory.SUCCESS,
        GOLogEventCategory.ERROR,
        GOLogEventCategory.FATAL,
        GOLogEventCategory.WARNING,
        GOLogEventCategory.HEADER,
        GOLogEventCategory.INFO,
        GOLogEventCategory.SECTION,
      ],
    );
  });

  it('logs fields with the values aligned in a column', () => {
    const handler = new RecordingLoggerHandler();
    new GOLogger([handler]).fields({ Status: 'completed', 'Steps executed': 7, Empty: undefined });

    assert.deepStrictEqual(
      handler.events.map((e) => [e.category, e.message]),
      [
        [GOLogEventCategory.INFO, 'Status          completed'],
        [GOLogEventCategory.INFO, 'Steps executed  7'],
        [GOLogEventCategory.INFO, 'Empty           '],
      ],
    );
  });

  it('logs a tree one line per event, without indent unless asked', () => {
    const handler = new RecordingLoggerHandler();
    const logger = new GOLogger([handler]);
    logger.tree([{ label: 'first' }, { label: 'last', children: [{ label: 'detail' }] }]);
    logger.tree([{ label: 'more' }], { indent: '> ', siblingsFollow: true });

    assert.deepStrictEqual(
      handler.events.map((e) => [e.category, e.message]),
      [
        [GOLogEventCategory.TEXT, '├─ first'],
        [GOLogEventCategory.TEXT, '└─ last'],
        [GOLogEventCategory.TEXT, '   └─ detail'],
        [GOLogEventCategory.TEXT, '> ├─ more'],
      ],
    );
  });

  it('resets all handlers', async () => {
    const handler = new RecordingLoggerHandler();
    await new GOLogger([handler]).reset();
    assert.strictEqual(handler.resets, 1);
  });

  it('logs tables one line per event', () => {
    const handler = new RecordingLoggerHandler();
    const logger = new GOLogger([handler]);
    const linesOf = (log: LogActionFn): string[] => {
      handler.events.length = 0;
      log();
      return handler.events.map((e) => e.message);
    };

    const table = linesOf(() =>
      logger.table({ columns: [{ header: 'H1', key: 'k1' }], data: [{ k1: 'v1' }], style: { colors: false } }),
    );
    assert.ok(table.length >= 3, 'borders and header');
    assert.ok(table.some((line) => line.includes('v1')));

    const simple = linesOf(() => logger.simpleTable([{ name: 'Alice' }], { style: { colors: false } }));
    assert.ok(
      simple.some((line) => line.includes('Name')),
      'header derived from the capitalized key',
    );
    assert.ok(simple.some((line) => line.includes('Alice')));

    const keyValue = linesOf(() => logger.keyValueTable({ Key1: 'Value1' }, { style: { colors: false } }));
    assert.ok(keyValue.some((line) => line.includes('Key1') && line.includes('Value1')));

    handler.events.length = 0;
    logger.simpleTable([]);
    assert.strictEqual(handler.events[0]?.category, GOLogEventCategory.WARNING, 'empty data logs a warning');
  });
});
