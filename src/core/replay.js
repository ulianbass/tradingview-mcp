/**
 * Core replay mode logic.
 *
 * Combines:
 *   - Upstream fixes from tradesdontlie/tradingview-mcp (commits 596def81, 6ccac647):
 *     * selectDate() promise handling + polling until replay is truly initialized
 *     * step() polls until currentDate changes (doStep() is async internally)
 *     * Removed hideReplayToolbar() calls (corrupts cloud account state)
 *     * VALID_AUTOPLAY_DELAYS validation BEFORE any CDP call (invalid values
 *       permanently corrupt _autoplayDelay across devices)
 *   - Our security hardening: escapeJsString, validateNumber, ErrorCodes
 */
import { evaluate, getReplayApi } from '../connection.js';
import { escapeJsString, validateNumber } from '../sanitize.js';
import { sleep } from '../await.js';
import { ErrorCodes } from '../errors.js';

export const VALID_AUTOPLAY_DELAYS = [100, 143, 200, 300, 1000, 2000, 3000, 5000, 10000];

function wv(path) {
  return `(function(){ var v = ${path}; return (v && typeof v === 'object' && typeof v.value === 'function') ? v.value() : v; })()`;
}

export async function start({ date } = {}) {
  const rp = await getReplayApi();
  const available = await evaluate(wv(`${rp}.isReplayAvailable()`));
  if (!available) {
    const err = new Error('Replay is not available for the current symbol/timeframe');
    err.code = ErrorCodes.API_NOT_AVAILABLE;
    throw err;
  }

  await evaluate(`${rp}.showReplayToolbar()`);

  // selectDate() is async — it calls enableReplayMode() then _onPointSelected()
  // which initializes the server-side replay session. Must be awaited inside the
  // page context, otherwise the promise is fire-and-forget and replay state says
  // "started" but stepping doesn't work.
  if (date) {
    const ts = new Date(date).getTime();
    if (isNaN(ts)) {
      const err = new Error(`Invalid date: "${date}". Use YYYY-MM-DD format or ISO 8601.`);
      err.code = ErrorCodes.INVALID_INPUT;
      throw err;
    }
    await evaluate(`${rp}.selectDate(${ts}).then(function() { return 'ok'; })`);
  } else {
    await evaluate(`${rp}.selectFirstAvailableDate()`);
  }

  // Poll until replay is fully initialized: isReplayStarted AND currentDate is set.
  // selectDate()'s promise resolves before the data series is ready, so we need
  // to wait for currentDate to become non-null before stepping will work.
  let started = false;
  let currentDate = null;
  for (let i = 0; i < 30; i++) {
    started = await evaluate(wv(`${rp}.isReplayStarted()`));
    currentDate = await evaluate(wv(`${rp}.currentDate()`));
    if (started && currentDate !== null) break;
    await sleep(250);
  }

  if (!started) {
    try { await evaluate(`${rp}.stopReplay()`); } catch {}
    const err = new Error(
      'Replay failed to start. The selected date may not have data for this timeframe. Try a more recent date or a higher timeframe (e.g., Daily).',
    );
    err.code = ErrorCodes.CHART_NOT_READY;
    throw err;
  }

  return {
    success: true,
    replay_started: true,
    date: date || '(first available)',
    current_date: currentDate,
  };
}

export async function step() {
  const rp = await getReplayApi();
  const started = await evaluate(wv(`${rp}.isReplayStarted()`));
  if (!started) {
    const err = new Error('Replay is not started. Use replay_start first.');
    err.code = ErrorCodes.CHART_NOT_READY;
    throw err;
  }
  const before = await evaluate(wv(`${rp}.currentDate()`));
  await evaluate(`${rp}.doStep()`);

  // doStep() is async internally — currentDate takes ~500ms to update.
  // Poll until it changes or timeout after 3s.
  let currentDate = before;
  for (let i = 0; i < 12; i++) {
    await sleep(250);
    currentDate = await evaluate(wv(`${rp}.currentDate()`));
    if (currentDate !== before) break;
  }
  return { success: true, action: 'step', current_date: currentDate };
}

export async function autoplay({ speed } = {}) {
  // CRITICAL: Validate BEFORE any CDP call — invalid values permanently corrupt
  // _autoplayDelay in the TradingView cloud account state, causing assertion
  // failures across all devices the user logs into.
  if (speed != null && Number(speed) > 0 && !VALID_AUTOPLAY_DELAYS.includes(Number(speed))) {
    const err = new Error(
      `Invalid autoplay delay ${speed}ms. Valid values: ${VALID_AUTOPLAY_DELAYS.join(', ')}`,
    );
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }

  const rp = await getReplayApi();
  const started = await evaluate(wv(`${rp}.isReplayStarted()`));
  if (!started) {
    const err = new Error('Replay is not started. Use replay_start first.');
    err.code = ErrorCodes.CHART_NOT_READY;
    throw err;
  }

  if (speed != null && Number(speed) > 0) {
    const validSpeed = validateNumber(speed, 'speed');
    await evaluate(`${rp}.changeAutoplayDelay(${validSpeed})`);
  }
  await evaluate(`${rp}.toggleAutoplay()`);
  const isAutoplay = await evaluate(wv(`${rp}.isAutoplayStarted()`));
  const currentDelay = await evaluate(wv(`${rp}.autoplayDelay()`));
  return { success: true, autoplay_active: !!isAutoplay, delay_ms: currentDelay };
}

export async function stop() {
  // IMPORTANT: Do NOT call hideReplayToolbar() — it syncs hidden-toolbar state
  // to the user's cloud account and permanently breaks replay controls on all
  // devices the user logs into. stopReplay() alone is sufficient.
  const rp = await getReplayApi();
  const started = await evaluate(wv(`${rp}.isReplayStarted()`));
  if (!started) {
    return { success: true, action: 'already_stopped' };
  }
  await evaluate(`${rp}.stopReplay()`);
  return { success: true, action: 'replay_stopped' };
}

export async function trade({ action }) {
  const rp = await getReplayApi();
  const started = await evaluate(wv(`${rp}.isReplayStarted()`));
  if (!started) {
    const err = new Error('Replay is not started. Use replay_start first.');
    err.code = ErrorCodes.CHART_NOT_READY;
    throw err;
  }

  if (action === 'buy') await evaluate(`${rp}.buy()`);
  else if (action === 'sell') await evaluate(`${rp}.sell()`);
  else if (action === 'close') await evaluate(`${rp}.closePosition()`);
  else {
    const err = new Error('Invalid action. Use: buy, sell, or close');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }

  const position = await evaluate(wv(`${rp}.position()`));
  const pnl = await evaluate(wv(`${rp}.realizedPL()`));
  return { success: true, action, position, realized_pnl: pnl };
}

export async function status() {
  const rp = await getReplayApi();
  const st = await evaluate(`
    (function() {
      var r = ${rp};
      function unwrap(v) { return (v && typeof v === 'object' && typeof v.value === 'function') ? v.value() : v; }
      return {
        is_replay_available: unwrap(r.isReplayAvailable()),
        is_replay_started: unwrap(r.isReplayStarted()),
        is_autoplay_started: unwrap(r.isAutoplayStarted()),
        replay_mode: unwrap(r.replayMode()),
        current_date: unwrap(r.currentDate()),
        autoplay_delay: unwrap(r.autoplayDelay()),
      };
    })()
  `);
  const pos = await evaluate(wv(`${rp}.position()`));
  const pnl = await evaluate(wv(`${rp}.realizedPL()`));
  return { success: true, ...st, position: pos, realized_pnl: pnl };
}
