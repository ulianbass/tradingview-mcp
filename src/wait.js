/**
 * Legacy wait.js — kept as a thin wrapper for backwards compatibility.
 *
 * New code should import from './await.js' directly:
 *   import { waitForChart } from './await.js';
 *
 * This wrapper preserves the old boolean return signature so existing
 * callers don't break while we migrate them.
 */
import { waitForChart } from './await.js';

const DEFAULT_TIMEOUT = 10000;

export async function waitForChartReady(expectedSymbol = null, expectedTf = null, timeout = DEFAULT_TIMEOUT) {
  const result = await waitForChart({
    expectedSymbol,
    expectedResolution: expectedTf,
    timeout,
  });
  return result.ok;
}
