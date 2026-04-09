/**
 * Selector regression test.
 *
 * Runs against a LIVE TradingView Desktop chart and verifies that each
 * selector key in src/selectors.js still resolves to at least one element
 * (for selectors that are expected to always exist) or is gracefully
 * absent (for panels that only appear when opened).
 *
 * Requires:
 *   - TradingView Desktop running with --remote-debugging-port=9222
 *   - At least one chart tab open
 *
 * Run:
 *   node --test tests/selectors.test.js
 *
 * This test is expected to fail ruidosamente when TradingView refactors
 * its DOM — that's the signal to update src/selectors.js.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { evaluate, disconnect } from '../src/connection.js';
import { Selectors } from '../src/selectors.js';

/**
 * Selectors that must ALWAYS resolve on a live chart (if they don't,
 * something is wrong with the chart state or TradingView changed the DOM).
 */
const ALWAYS_PRESENT = [
  'chartCanvas',
  'symbolTitle',
];

/**
 * Selectors that only exist when their panel is open. We just verify
 * the list is well-formed, not that they resolve.
 */
const OPTIONAL = [
  'loader',
  'bottomPanel',
  'rightPanel',
  'strategyTesterPanel',
  'strategyReportItem',
  'alertButton',
  'alertInputContainer',
  'alertSubmitButton',
  'pineEditorMonaco',
  'pineConsoleRow',
  'pineConsoleLog',
  'fullscreenButton',
  'tradingPanelButton',
  'tradingPositionsTable',
  'tradingOrdersTable',
  'domPanel',
  'watchlistButton',
];

async function anyResolves(selectorList) {
  const jsonList = JSON.stringify(selectorList);
  return evaluate(
    `(function(){var s=${jsonList};for(var i=0;i<s.length;i++){if(document.querySelector(s[i]))return s[i];}return null;})()`,
  );
}

test('all selector keys are valid arrays', () => {
  for (const key of Object.keys(Selectors)) {
    assert.ok(Array.isArray(Selectors[key]), `${key} should be an array`);
    assert.ok(Selectors[key].length > 0, `${key} should have at least one selector`);
    for (const sel of Selectors[key]) {
      assert.strictEqual(typeof sel, 'string', `${key} selectors must be strings`);
      assert.ok(sel.length > 0, `${key} selectors must be non-empty`);
    }
  }
});

test('ALWAYS_PRESENT selectors resolve on live chart', async () => {
  for (const key of ALWAYS_PRESENT) {
    const match = await anyResolves(Selectors[key]);
    assert.ok(
      match,
      `Selector '${key}' did not resolve. Tried: ${JSON.stringify(Selectors[key])}. Update src/selectors.js if TradingView changed its DOM.`,
    );
  }
  await disconnect();
});

test('OPTIONAL selectors have well-formed lists (may or may not resolve)', async () => {
  // Just verify the selector strings are syntactically valid by attempting
  // document.querySelector — if any throws (invalid CSS), the test fails.
  for (const key of OPTIONAL) {
    for (const sel of Selectors[key]) {
      const ok = await evaluate(
        `(function(){try{document.querySelector(${JSON.stringify(sel)});return true;}catch(e){return false;}})()`,
      );
      assert.ok(ok, `Selector '${key}' → '${sel}' is syntactically invalid`);
    }
  }
  await disconnect();
});
