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
