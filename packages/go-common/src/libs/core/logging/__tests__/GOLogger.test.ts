import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { GOLogger } from '../GOLogger.js';
import { GOLogEvent } from '../GOLogEvent.js';
import { GOLogEventCategory } from '../GOLogEventCategory.js';
import type { GOLoggerHandler } from '../GOLoggerHandler.js';

describe('GOLogger', () => {
  it('registers and unregisters handlers', () => {
    const logger = new GOLogger();
    const handler: GOLoggerHandler = {
      handle: mock.fn(),
      reset: mock.fn(),
    };

    logger.registerHandler(handler);
    assert.strictEqual(logger.getHandlers().length, 1);
    assert.strictEqual(logger.getHandlers()[0], handler);

    logger.unregisterHandler(handler);
    assert.strictEqual(logger.getHandlers().length, 0);
  });

  it('unregistering non-existent handler does nothing', () => {
    const logger = new GOLogger();
    const handler: GOLoggerHandler = {
      handle: mock.fn(),
      reset: mock.fn(),
    };
    logger.unregisterHandler(handler);
    assert.strictEqual(logger.getHandlers().length, 0);
  });

  it('logs events to all handlers', () => {
    const handler1: GOLoggerHandler = { handle: mock.fn(), reset: mock.fn() };
    const handler2: GOLoggerHandler = { handle: mock.fn(), reset: mock.fn() };
    const logger = new GOLogger([handler1, handler2]);

    logger.info('test info');

    assert.strictEqual((handler1.handle as any).mock.callCount(), 1);
    assert.strictEqual((handler2.handle as any).mock.callCount(), 1);

    const event = (handler1.handle as any).mock.calls[0].arguments[0] as GOLogEvent;
    assert.strictEqual(event.message, 'test info');
    assert.strictEqual(event.category, GOLogEventCategory.INFO);
  });

  it('supports logging by category and message', () => {
    const handler: GOLoggerHandler = { handle: mock.fn(), reset: mock.fn() };
    const logger = new GOLogger([handler]);

    logger.log(GOLogEventCategory.SUCCESS, 'great success');

    const event = (handler.handle as any).mock.calls[0].arguments[0] as GOLogEvent;
    assert.strictEqual(event.message, 'great success');
    assert.strictEqual(event.category, GOLogEventCategory.SUCCESS);
  });

  it('throws on invalid log arguments', () => {
    const logger = new GOLogger();
    assert.throws(() => {
      (logger as any).log(GOLogEventCategory.SUCCESS);
    }, /Invalid log arguments/);
  });

  it('provides convenience methods for all categories', () => {
    const handler: GOLoggerHandler = { handle: mock.fn(), reset: mock.fn() };
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

    const calls = (handler.handle as any).mock.calls;
    assert.strictEqual(calls.length, 10);
    assert.strictEqual(calls[0].arguments[0].category, GOLogEventCategory.TEXT);
    assert.strictEqual(calls[1].arguments[0].category, GOLogEventCategory.TEXT);
    assert.strictEqual(calls[2].arguments[0].category, GOLogEventCategory.STEP);
    assert.strictEqual(calls[3].arguments[0].category, GOLogEventCategory.SUCCESS);
    assert.strictEqual(calls[4].arguments[0].category, GOLogEventCategory.ERROR);
    assert.strictEqual(calls[5].arguments[0].category, GOLogEventCategory.FATAL);
    assert.strictEqual(calls[6].arguments[0].category, GOLogEventCategory.WARNING);
    assert.strictEqual(calls[7].arguments[0].category, GOLogEventCategory.HEADER);
    assert.strictEqual(calls[8].arguments[0].category, GOLogEventCategory.INFO);
    assert.strictEqual(calls[9].arguments[0].category, GOLogEventCategory.SECTION);
  });

  it('resets all handlers', async () => {
    const handler: GOLoggerHandler = { handle: mock.fn(), reset: mock.fn() };
    const logger = new GOLogger([handler]);

    await logger.reset();

    assert.strictEqual((handler.reset as any).mock.callCount(), 1);
  });

  it('logs tables', () => {
    const handler: GOLoggerHandler = { handle: mock.fn(), reset: mock.fn() };
    const logger = new GOLogger([handler]);

    logger.table({
      columns: [{ header: 'H1', key: 'k1' }],
      data: [{ k1: 'v1' }],
      style: { colors: false },
    });

    // Should log at least 3 lines (top border, header, bottom border)
    const calls = (handler.handle as any).mock.calls;
    assert.ok(calls.length >= 3);
  });

  it('logs simple tables', () => {
    const handler: GOLoggerHandler = { handle: mock.fn(), reset: mock.fn() };
    const logger = new GOLogger([handler]);

    logger.simpleTable([{ name: 'Alice' }], { style: { colors: false } });

    const calls = (handler.handle as any).mock.calls;
    assert.ok(calls.length > 0);
    // Check that header is capitalized
    const headerCall = calls.find((c: any) => c.arguments[0].message.includes('Name'));
    assert.ok(headerCall);
  });

  it('handles empty data in simpleTable', () => {
    const handler: GOLoggerHandler = { handle: mock.fn(), reset: mock.fn() };
    const logger = new GOLogger([handler]);

    logger.simpleTable([]);

    const calls = (handler.handle as any).mock.calls;
    // Should log a warning
    assert.strictEqual(calls[0].arguments[0].category, GOLogEventCategory.WARNING);
  });

  it('logs key-value tables', () => {
    const handler: GOLoggerHandler = { handle: mock.fn(), reset: mock.fn() };
    const logger = new GOLogger([handler]);

    logger.keyValueTable({ Key1: 'Value1' }, { style: { colors: false } });

    const calls = (handler.handle as any).mock.calls;
    assert.ok(calls.length > 0);
  });
});
