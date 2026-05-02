/**
 * Event-driven waiters. Replace hardcoded setTimeout with these.
 *
 * All waiters:
 * - Take an explicit timeout (no hidden defaults in the middle of core logic)
 * - Return { ok: true, value, elapsed_ms } on success
 * - Return { ok: false, code, elapsed_ms, last_value } on timeout
 * - Use exponential backoff on polling to avoid hammering CDP
 */
import { evaluate } from './connection.js';
import { ErrorCodes } from './errors.js';

const DEFAULT_POLL_MIN = 100;
const DEFAULT_POLL_MAX = 500;
const DEFAULT_TIMEOUT = 10000;

/**
 * Sleep helper. Only use when there's no signal to wait on.
 * Prefer the waiters below wherever possible.
 */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wait for an arbitrary async predicate to return truthy.
 * Returns the predicate's value on success.
 *
 * @param {() => Promise<any>} predicate - returns truthy value when done
 * @param {object} opts - { timeout, pollMin, pollMax, label }
 */
export async function waitForCondition(predicate, opts = {}) {
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  const pollMin = opts.pollMin ?? DEFAULT_POLL_MIN;
  const pollMax = opts.pollMax ?? DEFAULT_POLL_MAX;
  const label = opts.label ?? 'condition';
  const start = Date.now();
  let delay = pollMin;
  let lastValue = null;
  let lastError = null;

  while (Date.now() - start < timeout) {
    try {
      const value = await predicate();
      lastValue = value;
      if (value) {
        return { ok: true, value, elapsed_ms: Date.now() - start };
      }
    } catch (e) {
      lastError = e.message || String(e);
    }
    await sleep(delay);
    delay = Math.min(delay * 1.5, pollMax);
  }

  return {
    ok: false,
    code: ErrorCodes.TIMEOUT_WAITING_FOR_CONDITION,
    elapsed_ms: Date.now() - start,
    last_value: lastValue,
    last_error: lastError,
    label,
  };
}

/**
 * Wait for a CSS selector to resolve in the page.
 */
export async function waitForSelector(selector, opts = {}) {
  const result = await waitForCondition(
    async () => {
      const exists = await evaluate(
        `!!document.querySelector(${JSON.stringify(selector)})`,
      );
      return exists ? { selector } : null;
    },
    { ...opts, label: `selector:${selector}` },
  );
  if (!result.ok) result.code = ErrorCodes.TIMEOUT_WAITING_FOR_ELEMENT;
  return result;
}

/**
 * Wait for the chart's study count to change by a given delta.
 * Useful after createStudy/removeEntity to know the operation finished.
 */
export async function waitForStudyDelta(initialCount, delta, opts = {}) {
  const expected = initialCount + delta;
  const result = await waitForCondition(
    async () => {
      const count = await evaluate(
        `(function(){try{var c=window.TradingViewApi._activeChartWidgetWV.value();return c.getAllStudies().length;}catch(e){return -1;}})()`,
      );
      if (count === expected) return { count };
      return null;
    },
    { ...opts, label: `studyDelta:${delta}` },
  );
  if (!result.ok) result.code = ErrorCodes.TIMEOUT_WAITING_FOR_STUDY;
  return result;
}

/**
 * Wait for the chart to be ready after a symbol/timeframe change.
 *
 * This replaces the old heuristic wait.js approach with:
 * - Strict symbol matching (not includes())
 * - Bar count stability across polls
 * - No dependency on fragile [class*="bar"] selectors
 */
export async function waitForChart({ expectedSymbol, expectedResolution, timeout = DEFAULT_TIMEOUT } = {}) {
  const start = Date.now();
  let lastBarCount = -1;
  let stableCount = 0;
  let lastSnapshot = null;

  const result = await waitForCondition(
    async () => {
      const snap = await evaluate(`
        (function() {
          try {
            var chart = window.TradingViewApi._activeChartWidgetWV.value();
            if (!chart) return null;
            var sym = chart.symbol();
            var res = chart.resolution();
            var bars = null;
            try {
              var b = chart._chartWidget.model().mainSeries().bars();
              bars = b && typeof b.size === 'function' ? b.size() : null;
            } catch(e) {}
            return { symbol: sym, resolution: res, bar_count: bars };
          } catch(e) { return null; }
        })()
      `);

      if (!snap) return null;
      lastSnapshot = snap;

      // Strict symbol match — normalize both sides and compare exactly
      if (expectedSymbol) {
        const want = normalizeSymbol(expectedSymbol);
        const have = normalizeSymbol(snap.symbol);
        if (want !== have) {
          stableCount = 0;
          return null;
        }
      }

      // Strict resolution match
      if (expectedResolution && String(snap.resolution) !== String(expectedResolution)) {
        stableCount = 0;
        return null;
      }

      // Bar count must be stable across 2 polls
      if (snap.bar_count != null && snap.bar_count > 0) {
        if (snap.bar_count === lastBarCount) {
          stableCount++;
          if (stableCount >= 2) return snap;
        } else {
          stableCount = 1;
          lastBarCount = snap.bar_count;
        }
      }
      return null;
    },
    { timeout, label: 'chartReady' },
  );

  if (!result.ok) {
    result.code = ErrorCodes.TIMEOUT_WAITING_FOR_CHART;
    result.last_value = lastSnapshot;
  }
  return result;
}

/**
 * Normalize a symbol string so "BINANCE:BTCUSDT" and "BTCUSDT" compare equal.
 */
function normalizeSymbol(sym) {
  if (!sym) return '';
  const s = String(sym).toUpperCase().trim();
  const colonIdx = s.indexOf(':');
  return colonIdx >= 0 ? s.slice(colonIdx + 1) : s;
}
