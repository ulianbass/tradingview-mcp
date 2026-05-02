/**
 * Remote Pine compile tests.
 *
 * These hit TradingView's pine-facade endpoint over the network. Keep them
 * out of the default unit suite so `npm test` remains deterministic offline.
 *
 * Run: npm run test:remote
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const PINE_TRANSLATE_URL =
  'https://pine-facade.tradingview.com/pine-facade/translate_light?user_name=Guest&pine_id=00000000-0000-0000-0000-000000000000';

async function compile(source) {
  const formData = new URLSearchParams();
  formData.append('source', source);

  return fetch(PINE_TRANSLATE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://www.tradingview.com/',
    },
    body: formData,
  });
}

describe('pine_check — remote server compile', () => {
  it('compiles valid Pine Script via TradingView API', async () => {
    const source = `//@version=6
indicator("API Test", overlay=true)
plot(close, "Close", color=color.blue)`;

    const response = await compile(source);

    assert.ok(response.ok, `API returned ${response.status}`);
    const result = await response.json();
    assert.ok(result.result || result.error === undefined, 'Should compile successfully');
  });

  it('returns errors for invalid Pine Script', async () => {
    const source = `//@version=6
indicator("Bad")
this_function_does_not_exist()`;

    const response = await compile(source);

    assert.ok(response.ok, `API returned ${response.status}`);
    const result = await response.json();
    const errors = result?.result?.errors2 || [];
    assert.ok(errors.length > 0, `Should have compilation errors, got: ${JSON.stringify(result).slice(0, 200)}`);

    const msg = errors[0].message || '';
    const ctx = errors[0].ctx || {};
    const mentionsBadFn = msg.includes('this_function_does_not_exist') || ctx.fullName === 'this_function_does_not_exist';
    assert.ok(mentionsBadFn, 'Error should mention the bad function via message or ctx.fullName');
  });

  it('handles empty source gracefully', async () => {
    const response = await compile('');

    assert.ok(response.status === 400 || response.status === 200, `Unexpected status: ${response.status}`);
  });
});
