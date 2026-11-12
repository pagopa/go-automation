import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GOLogEvent } from '../GOLogEvent.js';
import { GOLogEventCategory } from '../GOLogEventCategory.js';

describe('GOLogEvent', () => {
  it('constructor sets message and category', () => {
    const event = new GOLogEvent('test message', GOLogEventCategory.INFO);
    assert.strictEqual(event.message, 'test message');
    assert.strictEqual(event.category, GOLogEventCategory.INFO);
    assert.ok(event.timestamp instanceof Date);
  });

  it('constructor defaults category to STEP', () => {
    const event = new GOLogEvent('test message');
    assert.strictEqual(event.category, GOLogEventCategory.STEP);
  });

  it('newline() creates a TEXT event with empty message', () => {
    const event = GOLogEvent.newline();
    assert.strictEqual(event.message, '');
    assert.strictEqual(event.category, GOLogEventCategory.TEXT);
  });

  it('text() creates a TEXT event', () => {
    const event = GOLogEvent.text('hello');
    assert.strictEqual(event.message, 'hello');
    assert.strictEqual(event.category, GOLogEventCategory.TEXT);
  });

  it('step() creates a STEP event', () => {
    const event = GOLogEvent.step('step 1');
    assert.strictEqual(event.message, 'step 1');
    assert.strictEqual(event.category, GOLogEventCategory.STEP);
  });

  it('success() creates a SUCCESS event', () => {
    const event = GOLogEvent.success('yay');
    assert.strictEqual(event.message, 'yay');
    assert.strictEqual(event.category, GOLogEventCategory.SUCCESS);
  });

  it('error() creates an ERROR event', () => {
    const event = GOLogEvent.error('oops');
    assert.strictEqual(event.message, 'oops');
    assert.strictEqual(event.category, GOLogEventCategory.ERROR);
  });

  it('fatal() creates a FATAL event', () => {
    const event = GOLogEvent.fatal('dead');
    assert.strictEqual(event.message, 'dead');
    assert.strictEqual(event.category, GOLogEventCategory.FATAL);
  });

  it('warning() creates a WARNING event', () => {
    const event = GOLogEvent.warning('caution');
    assert.strictEqual(event.message, 'caution');
    assert.strictEqual(event.category, GOLogEventCategory.WARNING);
  });

  it('header() creates a HEADER event', () => {
    const event = GOLogEvent.header('title');
    assert.strictEqual(event.message, 'title');
    assert.strictEqual(event.category, GOLogEventCategory.HEADER);
  });

  it('info() creates an INFO event', () => {
    const event = GOLogEvent.info('note');
    assert.strictEqual(event.message, 'note');
    assert.strictEqual(event.category, GOLogEventCategory.INFO);
  });

  it('section() creates a SECTION event', () => {
    const event = GOLogEvent.section('part 1');
    assert.strictEqual(event.message, 'part 1');
    assert.strictEqual(event.category, GOLogEventCategory.SECTION);
  });
});
