/**
 * Core drawing logic.
 */
import { evaluate, getChartApi } from '../connection.js';
import { escapeJsString, validateNumber } from '../sanitize.js';
import { sleep } from '../await.js';
import { ErrorCodes } from '../errors.js';

const VALID_SHAPES_2PT = [
  'trend_line', 'rectangle', 'horizontal_line', 'vertical_line', 'text',
  'fib_retracement', 'fib_extension', 'fib_channel',
  'gann_fan', 'gann_box',
];
const VALID_SHAPES_3PT = ['triangle', 'parallel_channel', 'pitchfork', 'schiff_pitchfork'];

/**
 * Draw a multi-point shape (Fibonacci, channel, pitchfork, triangle, etc).
 * Accepts an array of points — TradingView determines how many it needs.
 */
export async function drawMultipoint({ shape, points, overrides: overridesRaw, text }) {
  let overrides = {};
  if (overridesRaw) {
    if (typeof overridesRaw === 'string') {
      try { overrides = JSON.parse(overridesRaw); } catch (e) {
        const err = new Error(`Invalid JSON for overrides: ${e.message}`);
        err.code = ErrorCodes.PARSE_ERROR;
        throw err;
      }
    } else { overrides = overridesRaw; }
  }
  if (!Array.isArray(points) || points.length < 2) {
    const err = new Error('points must be an array of at least 2 {time, price} objects');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }

  const apiPath = await getChartApi();
  const validated = points.map((p, i) => ({
    time: validateNumber(p.time, `points[${i}].time`),
    price: validateNumber(p.price, `points[${i}].price`),
  }));
  const pointsJson = JSON.stringify(validated);
  const overridesStr = JSON.stringify(overrides || {});
  const textStr = text ? JSON.stringify(text) : '""';
  const escapedShape = escapeJsString(shape);

  const before = await evaluate(`${apiPath}.getAllShapes().map(function(s) { return s.id; })`);
  await evaluate(`
    ${apiPath}.createMultipointShape(
      ${pointsJson},
      { shape: '${escapedShape}', overrides: ${overridesStr}, text: ${textStr} }
    )
  `);
  await sleep(200);
  const after = await evaluate(`${apiPath}.getAllShapes().map(function(s) { return s.id; })`);
  const newId = (after || []).find((id) => !(before || []).includes(id)) || null;

  return { success: !!newId, shape, entity_id: newId, point_count: validated.length };
}

export async function drawShape({ shape, point, point2, overrides: overridesRaw, text }) {
  let overrides = {};
  if (overridesRaw) {
    if (typeof overridesRaw === 'string') {
      try { overrides = JSON.parse(overridesRaw); } catch (e) { throw new Error(`Invalid JSON for overrides: ${e.message}`); }
    } else { overrides = overridesRaw; }
  }
  const apiPath = await getChartApi();
  const overridesStr = JSON.stringify(overrides || {});
  const textStr = text ? JSON.stringify(text) : '""';
  const escapedShape = escapeJsString(shape);
  const p1Time = validateNumber(point.time, 'point.time');
  const p1Price = validateNumber(point.price, 'point.price');

  const before = await evaluate(`${apiPath}.getAllShapes().map(function(s) { return s.id; })`);

  if (point2) {
    const p2Time = validateNumber(point2.time, 'point2.time');
    const p2Price = validateNumber(point2.price, 'point2.price');
    await evaluate(`
      ${apiPath}.createMultipointShape(
        [{ time: ${p1Time}, price: ${p1Price} }, { time: ${p2Time}, price: ${p2Price} }],
        { shape: '${escapedShape}', overrides: ${overridesStr}, text: ${textStr} }
      )
    `);
  } else {
    await evaluate(`
      ${apiPath}.createShape(
        { time: ${p1Time}, price: ${p1Price} },
        { shape: '${escapedShape}', overrides: ${overridesStr}, text: ${textStr} }
      )
    `);
  }

  await sleep(200);
  const after = await evaluate(`${apiPath}.getAllShapes().map(function(s) { return s.id; })`);
  const newId = (after || []).find(id => !(before || []).includes(id)) || null;
  const result = { entity_id: newId };
  return { success: true, shape, entity_id: result?.entity_id };
}

export async function listDrawings() {
  const apiPath = await getChartApi();
  const shapes = await evaluate(`
    (function() {
      var api = ${apiPath};
      var all = api.getAllShapes();
      return all.map(function(s) { return { id: s.id, name: s.name }; });
    })()
  `);
  return { success: true, count: shapes?.length || 0, shapes: shapes || [] };
}

export async function getProperties({ entity_id }) {
  const apiPath = await getChartApi();
  const escapedId = escapeJsString(entity_id);
  const result = await evaluate(`
    (function() {
      var api = ${apiPath};
      var eid = '${escapedId}';
      var props = { entity_id: eid };
      var shape = api.getShapeById(eid);
      if (!shape) return { error: 'Shape not found: ' + eid };
      var methods = [];
      try { for (var key in shape) { if (typeof shape[key] === 'function') methods.push(key); } props.available_methods = methods; } catch(e) {}
      try { var pts = shape.getPoints(); if (pts) props.points = pts; } catch(e) { props.points_error = e.message; }
      try { var ovr = shape.getProperties(); if (ovr) props.properties = ovr; } catch(e) {
        try { var ovr2 = shape.properties(); if (ovr2) props.properties = ovr2; } catch(e2) { props.properties_error = e2.message; }
      }
      try { props.visible = shape.isVisible(); } catch(e) {}
      try { props.locked = shape.isLocked(); } catch(e) {}
      try { props.selectable = shape.isSelectionEnabled(); } catch(e) {}
      try {
        var all = api.getAllShapes();
        for (var i = 0; i < all.length; i++) { if (all[i].id === eid) { props.name = all[i].name; break; } }
      } catch(e) {}
      return props;
    })()
  `);
  if (result?.error) throw new Error(result.error);
  return { success: true, ...result };
}

export async function removeOne({ entity_id }) {
  const apiPath = await getChartApi();
  const escapedId = escapeJsString(entity_id);
  const result = await evaluate(`
    (function() {
      var api = ${apiPath};
      var eid = '${escapedId}';
      var before = api.getAllShapes();
      var found = false;
      for (var i = 0; i < before.length; i++) { if (before[i].id === eid) { found = true; break; } }
      if (!found) return { removed: false, error: 'Shape not found: ' + eid, available: before.map(function(s) { return s.id; }) };
      api.removeEntity(eid);
      var after = api.getAllShapes();
      var stillExists = false;
      for (var j = 0; j < after.length; j++) { if (after[j].id === eid) { stillExists = true; break; } }
      return { removed: !stillExists, entity_id: eid, remaining_shapes: after.length };
    })()
  `);
  if (result?.error) throw new Error(result.error);
  return { success: true, entity_id: result?.entity_id, removed: result?.removed, remaining_shapes: result?.remaining_shapes };
}

export async function clearAll() {
  const apiPath = await getChartApi();
  await evaluate(`${apiPath}.removeAllShapes()`);
  return { success: true, action: 'all_shapes_removed' };
}

/**
 * Replace all points of an existing shape at once.
 * The number of points MUST match what the shape expects (1 for
 * horizontal_line, 2 for trend_line/fib, 3 for pitchfork, etc).
 */
export async function updatePoints({ entity_id, points }) {
  if (!entity_id) {
    const err = new Error('entity_id is required');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  if (!Array.isArray(points) || points.length === 0) {
    const err = new Error('points must be a non-empty array of {time, price} objects');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  const validated = points.map((p, i) => ({
    time: validateNumber(p.time, `points[${i}].time`),
    price: validateNumber(p.price, `points[${i}].price`),
  }));
  const apiPath = await getChartApi();
  const escapedId = escapeJsString(entity_id);
  const pointsJson = JSON.stringify(validated);

  const result = await evaluate(`
    (function() {
      try {
        var api = ${apiPath};
        var shape = api.getShapeById('${escapedId}');
        if (!shape) return { error: 'Shape not found: ${escapedId}', code: 'SELECTOR_NOT_FOUND' };
        var expected = shape.getPoints().length;
        if (${validated.length} !== expected) {
          return { error: 'Wrong point count. Shape requires ' + expected + ', got ${validated.length}', code: 'INVALID_INPUT', expected: expected };
        }
        shape.setPoints(${pointsJson});
        return { ok: true, new_points: shape.getPoints() };
      } catch(e) { return { error: e.message, code: 'UNKNOWN_ERROR' }; }
    })()
  `);

  if (result?.error) {
    const err = new Error(result.error);
    err.code = result.code || ErrorCodes.UNKNOWN_ERROR;
    err.details = result;
    throw err;
  }
  return { success: true, entity_id, points: result.new_points };
}

/**
 * Change a single point of a shape by index (0-based).
 * Useful when you only want to move one endpoint of a trend line or
 * one handle of a pitchfork, leaving the others in place.
 */
export async function changePoint({ entity_id, index, point }) {
  if (!entity_id) {
    const err = new Error('entity_id is required');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  const idx = validateNumber(index, 'index');
  if (idx < 0 || !Number.isInteger(idx)) {
    const err = new Error('index must be a non-negative integer');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  const t = validateNumber(point.time, 'point.time');
  const p = validateNumber(point.price, 'point.price');
  const apiPath = await getChartApi();
  const escapedId = escapeJsString(entity_id);

  const result = await evaluate(`
    (function() {
      try {
        var api = ${apiPath};
        var shape = api.getShapeById('${escapedId}');
        if (!shape) return { error: 'Shape not found: ${escapedId}', code: 'SELECTOR_NOT_FOUND' };
        var pts = shape.getPoints();
        if (${idx} >= pts.length) {
          return { error: 'Index ${idx} out of range (shape has ' + pts.length + ' points)', code: 'INVALID_INPUT' };
        }
        shape.changePoint({ time: ${t}, price: ${p} }, ${idx});
        return { ok: true, new_points: shape.getPoints() };
      } catch(e) { return { error: e.message, code: 'UNKNOWN_ERROR' }; }
    })()
  `);

  if (result?.error) {
    const err = new Error(result.error);
    err.code = result.code || ErrorCodes.UNKNOWN_ERROR;
    throw err;
  }
  return { success: true, entity_id, index: idx, points: result.new_points };
}

/**
 * Minimum Risk/Reward ratio enforced by drawPosition. Setups below this
 * are rejected at the tool level so the agent CANNOT silently propose a
 * scalp with worse than 1:2. Override per call with `min_rr` if you
 * have a concrete reason (documented in CLAUDE.md rules).
 */
export const DEFAULT_MIN_RR = 2;

/**
 * Draw a Risk/Reward Long or Short position in ONE call, with entry,
 * stop-loss and take-profit set to exact prices — no post-creation
 * tweaking required. Internally uses TradingView's internal
 * `model.createLineTool` with `LineToolRiskRewardLong`/`Short` (the
 * public `createShape`/`createMultipointShape` APIs do not accept
 * `long_position` / `short_position` as shape names).
 *
 * The stopLevel/profitLevel values stored by the tool are integer
 * "ticks" (offsets in units of `minmov / pricescale`). We compute them
 * from the symbol's own `symbolInfo.pricescale` and `symbolInfo.minmov`
 * so the same code works for BTC (tickSize 0.01), MNQ (tickSize 0.25),
 * MES (tickSize 0.25), forex, etc.
 *
 * Direction is auto-detected from the prices when not given:
 *   - long  → sl < entry < tp
 *   - short → sl > entry > tp
 *
 * Minimum R:R guard: setups with R:R < 2 are REJECTED with a clear
 * error unless the caller explicitly overrides `min_rr`. This enforces
 * the project rule that no trade should be proposed with worse than
 * 1:2 risk/reward. Pass `min_rr: 0` to disable (not recommended).
 *
 * @param {Object}  opts
 * @param {number}  opts.entry     entry price
 * @param {number}  opts.sl        stop-loss price
 * @param {number}  opts.tp        take-profit price
 * @param {string}  [opts.direction]  'long' | 'short' (auto-detected if omitted)
 * @param {number}  [opts.risk_pct]   risk % for the info block (default 1)
 * @param {number}  [opts.account_size]  account size for qty calc (default 10000)
 * @param {number}  [opts.min_rr]     minimum R:R ratio (default 2)
 */
export async function drawPosition({ entry, sl, tp, direction, risk_pct, account_size, min_rr }) {
  const entryPrice = validateNumber(entry, 'entry');
  const slPrice = validateNumber(sl, 'sl');
  const tpPrice = validateNumber(tp, 'tp');

  // Auto-detect direction if not provided
  let dir = direction ? String(direction).toLowerCase() : null;
  if (!dir) {
    if (slPrice < entryPrice && tpPrice > entryPrice) dir = 'long';
    else if (slPrice > entryPrice && tpPrice < entryPrice) dir = 'short';
    else {
      const err = new Error(
        `Cannot auto-detect direction from prices: entry=${entryPrice}, sl=${slPrice}, tp=${tpPrice}. ` +
        'For LONG: sl < entry < tp. For SHORT: sl > entry > tp. Pass direction explicitly to override.'
      );
      err.code = ErrorCodes.INVALID_INPUT;
      throw err;
    }
  }
  if (dir !== 'long' && dir !== 'short') {
    const err = new Error(`direction must be 'long' or 'short', got '${dir}'`);
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }

  // Validate sl/tp coherence with direction
  if (dir === 'long' && !(slPrice < entryPrice && tpPrice > entryPrice)) {
    const err = new Error(`LONG requires sl < entry < tp (got sl=${slPrice}, entry=${entryPrice}, tp=${tpPrice})`);
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  if (dir === 'short' && !(slPrice > entryPrice && tpPrice < entryPrice)) {
    const err = new Error(`SHORT requires sl > entry > tp (got sl=${slPrice}, entry=${entryPrice}, tp=${tpPrice})`);
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }

  // R:R guard — reject setups below the minimum ratio (default 2)
  const stopDeltaPrice = dir === 'long' ? (entryPrice - slPrice) : (slPrice - entryPrice);
  const profitDeltaPrice = dir === 'long' ? (tpPrice - entryPrice) : (entryPrice - tpPrice);
  const rr = +(profitDeltaPrice / stopDeltaPrice).toFixed(3);
  const minRr = min_rr != null ? validateNumber(min_rr, 'min_rr') : DEFAULT_MIN_RR;
  if (rr < minRr) {
    const err = new Error(
      `Risk/reward ${rr} is below the minimum ${minRr}. ` +
      `Current setup: entry=${entryPrice}, sl=${slPrice}, tp=${tpPrice}, ` +
      `risk=${stopDeltaPrice.toFixed(4)}, reward=${profitDeltaPrice.toFixed(4)}. ` +
      `Re-plan with a wider TP or tighter SL, or pass min_rr explicitly to override.`
    );
    err.code = ErrorCodes.INVALID_INPUT;
    err.details = { rr, min_rr: minRr, entry: entryPrice, sl: slPrice, tp: tpPrice };
    throw err;
  }

  const linetool = dir === 'long' ? 'LineToolRiskRewardLong' : 'LineToolRiskRewardShort';
  const riskPct = risk_pct != null ? validateNumber(risk_pct, 'risk_pct') : 1;
  const accountSize = account_size != null ? validateNumber(account_size, 'account_size') : 10000;

  const apiPath = await getChartApi();

  // Everything in ONE evaluate call — create shape + set levels + read back id.
  // We go through the INTERNAL model (_chartWidget.model()) rather than the
  // public chartApi because long_position shapes need createLineTool, not
  // createShape/createMultipointShape.
  const result = await evaluate(`
    (function() {
      try {
        var widget = ${apiPath};
        var chartWidget = widget._chartWidget;
        if (!chartWidget) return { error: 'no chartWidget', code: 'SELECTOR_NOT_FOUND' };
        var model = chartWidget.model();
        var innerModel = model.model();
        var mainSeries = model.mainSeries();
        var bars = mainSeries.bars();
        var lastIdx = bars.lastIndex();
        var panes = innerModel.panes();
        var mainPane = panes[0];

        // Symbol tick conversion: ticks = priceDelta * pricescale / minmov
        var si = mainSeries.symbolInfo ? mainSeries.symbolInfo() : null;
        var pricescale = (si && si.pricescale) || 100;
        var minmov = (si && si.minmov) || 1;
        var ticksPerPrice = pricescale / minmov;

        var entryP = ${entryPrice};
        var slP = ${slPrice};
        var tpP = ${tpPrice};
        var isLong = ${dir === 'long' ? 'true' : 'false'};
        var stopDelta = isLong ? (entryP - slP) : (slP - entryP);
        var profitDelta = isLong ? (tpP - entryP) : (entryP - tpP);
        var stopLevel = Math.round(stopDelta * ticksPerPrice);
        var profitLevel = Math.round(profitDelta * ticksPerPrice);

        var shape = model.createLineTool({
          pane: mainPane,
          point: { index: lastIdx, price: entryP },
          linetool: '${linetool}',
          ownerSource: mainSeries
        });
        if (!shape) return { error: 'createLineTool returned null', code: 'UNKNOWN_ERROR' };

        // Merge stop/profit/risk levels in the same pass
        try {
          shape.properties().merge({
            stopLevel: stopLevel,
            profitLevel: profitLevel,
            risk: ${riskPct},
            accountSize: ${accountSize}
          });
        } catch (e) { /* merge may throw on redraw check — values still apply */ }

        var id = shape.id ? shape.id() : null;
        return {
          ok: true,
          entity_id: id,
          direction: isLong ? 'long' : 'short',
          stop_level_ticks: stopLevel,
          profit_level_ticks: profitLevel,
          ticks_per_price: ticksPerPrice,
          pricescale: pricescale,
          minmov: minmov,
          entry: entryP,
          sl: slP,
          tp: tpP,
          risk_reward: +(profitDelta / stopDelta).toFixed(2),
          last_index: lastIdx
        };
      } catch (e) {
        return { error: e.message, code: 'UNKNOWN_ERROR' };
      }
    })()
  `);

  if (result?.error) {
    const err = new Error(result.error);
    err.code = result.code || ErrorCodes.UNKNOWN_ERROR;
    throw err;
  }
  return { success: true, ...result };
}

/**
 * Translate a shape by a relative delta (time and/or price).
 * Works for any multi-point shape — internally offsets every point.
 */
export async function moveShape({ entity_id, delta_time = 0, delta_price = 0 }) {
  if (!entity_id) {
    const err = new Error('entity_id is required');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  const dt = validateNumber(delta_time, 'delta_time');
  const dp = validateNumber(delta_price, 'delta_price');
  if (dt === 0 && dp === 0) {
    return { success: true, entity_id, note: 'delta_time and delta_price both zero, no change' };
  }
  const apiPath = await getChartApi();
  const escapedId = escapeJsString(entity_id);

  const result = await evaluate(`
    (function() {
      try {
        var api = ${apiPath};
        var shape = api.getShapeById('${escapedId}');
        if (!shape) return { error: 'Shape not found: ${escapedId}', code: 'SELECTOR_NOT_FOUND' };
        var pts = shape.getPoints();
        var shifted = pts.map(function(p) {
          return { time: p.time + ${dt}, price: p.price + ${dp} };
        });
        shape.setPoints(shifted);
        return { ok: true, new_points: shape.getPoints() };
      } catch(e) { return { error: e.message, code: 'UNKNOWN_ERROR' }; }
    })()
  `);

  if (result?.error) {
    const err = new Error(result.error);
    err.code = result.code || ErrorCodes.UNKNOWN_ERROR;
    throw err;
  }
  return { success: true, entity_id, delta_time: dt, delta_price: dp, points: result.new_points };
}
