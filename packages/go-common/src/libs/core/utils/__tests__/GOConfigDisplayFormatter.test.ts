import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatConfigDisplay,
  formatConfigSourceDisplay,
  formatConfigValueDisplay,
} from '../GOConfigDisplayFormatter.js';

describe('GOConfigDisplayFormatter', () => {
  it('formats configuration sources', () => {
    assert.strictEqual(formatConfigSourceDisplay('', 20), '');
    assert.strictEqual(formatConfigSourceDisplay('CommandLine', 20), 'CommandLine');
    const plainSource = formatConfigSourceDisplay('VeryLongCommandLineSource', 12);
    assert.strictEqual(plainSource.length, 12);
    assert.strictEqual(plainSource.startsWith('VeryLongCom'), true);

    const yamlSource = formatConfigSourceDisplay('YAML(/Users/example/project/configs/config.yaml)', 28);
    assert.strictEqual(yamlSource.length <= 28, true);
    assert.strictEqual(yamlSource.startsWith('YAML('), true);
    assert.strictEqual(yamlSource.endsWith('/configs/config.yaml)'), true);

    const tinySource = formatConfigSourceDisplay('YAML(/too/long/path)', 4);
    assert.strictEqual(tinySource.length, 4);
    assert.notStrictEqual(tinySource, '');
  });

  it('formats configuration values', () => {
    assert.strictEqual(formatConfigValueDisplay('', 20), '');
    assert.strictEqual(formatConfigValueDisplay('"api.example.test"', 50), 'api.example.test');
    assert.strictEqual(formatConfigValueDisplay("'plain-value'", 50), 'plain-value');
    const plainValue = formatConfigValueDisplay('very long plain value', 12);
    assert.strictEqual(plainValue.length, 12);
    assert.strictEqual(plainValue.startsWith('very long p'), true);

    const pathValue = formatConfigValueDisplay('"/Users/example/config.yaml"', 18);
    assert.strictEqual(pathValue.length, 18);
    assert.strictEqual(pathValue.endsWith('le/config.yaml'), true);
  });

  it('formats value and source together', () => {
    const formatted = formatConfigDisplay('"../data/input.csv"', 'JSON(/Users/example/project/config.json)', 14, 25);

    assert.strictEqual(formatted.value.length, 14);
    assert.strictEqual(formatted.value.endsWith('ata/input.csv'), true);
    assert.strictEqual(formatted.source.length <= 25, true);
    assert.strictEqual(formatted.source.startsWith('JSON('), true);
    assert.strictEqual(formatted.source.endsWith('roject/config.json)'), true);
  });
});
