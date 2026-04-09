import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/drawing.js';

export function registerDrawingTools(server) {
  server.tool('draw_shape', 'Draw a shape/line on the chart', {
    shape: z.string().describe('Shape type: horizontal_line, vertical_line, trend_line, rectangle, text'),
    point: z.object({ time: z.coerce.number(), price: z.coerce.number() }).describe('{ time: unix_timestamp, price: number }'),
    point2: z.object({ time: z.coerce.number(), price: z.coerce.number() }).optional().describe('Second point for two-point shapes (trend_line, rectangle)'),
    overrides: z.string().optional().describe('JSON string of style overrides (e.g., \'{"linecolor": "#ff0000", "linewidth": 2}\')'),
    text: z.string().optional().describe('Text content for text shapes'),
  }, async ({ shape, point, point2, overrides, text }) => {
    try { return jsonResult(await core.drawShape({ shape, point, point2, overrides, text })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_list', 'List all shapes/drawings on the chart', {}, async () => {
    try { return jsonResult(await core.listDrawings()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_clear', 'Remove all drawings from the chart', {}, async () => {
    try { return jsonResult(await core.clearAll()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_remove_one', 'Remove a specific drawing by entity ID', {
    entity_id: z.string().describe('Entity ID of the drawing to remove (from draw_list)'),
  }, async ({ entity_id }) => {
    try { return jsonResult(await core.removeOne({ entity_id })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_get_properties', 'Get properties and points of a specific drawing', {
    entity_id: z.string().describe('Entity ID of the drawing (from draw_list)'),
  }, async ({ entity_id }) => {
    try { return jsonResult(await core.getProperties({ entity_id })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_multipoint', 'Draw multi-point shapes: Fibonacci retracement/extension/channel, parallel channels, pitchforks, triangles, Gann tools. Accepts any number of points (TradingView uses what it needs).', {
    shape: z.string().describe('Shape name: fib_retracement, fib_extension, fib_channel, parallel_channel, pitchfork, schiff_pitchfork, triangle, gann_fan, gann_box, trend_line, rectangle, horizontal_line, vertical_line'),
    points: z.array(z.object({ time: z.coerce.number(), price: z.coerce.number() })).describe('Array of {time: unix_seconds, price: number} points — pass 2 for trend/fib, 3 for pitchfork/channel/triangle'),
    overrides: z.string().optional().describe('JSON string of style overrides'),
    text: z.string().optional().describe('Text label for the shape'),
  }, async ({ shape, points, overrides, text }) => {
    try { return jsonResult(await core.drawMultipoint({ shape, points, overrides, text })); }
    catch (err) { return jsonResult({ success: false, error: err.message, code: err.code }, true); }
  });

  server.tool('draw_update_points', 'Replace ALL points of an existing drawing at once. Point count must match what the shape type expects (1 for horizontal_line, 2 for trend/fib, 3 for pitchfork).', {
    entity_id: z.string().describe('Entity ID of the drawing to update (from draw_list)'),
    points: z.array(z.object({ time: z.coerce.number(), price: z.coerce.number() })).describe('New points. Must match the shape\'s expected point count.'),
  }, async ({ entity_id, points }) => {
    try { return jsonResult(await core.updatePoints({ entity_id, points })); }
    catch (err) { return jsonResult({ success: false, error: err.message, code: err.code }, true); }
  });

  server.tool('draw_change_point', 'Move a single point of a drawing by index (0-based). Useful for dragging one endpoint of a trend line or one handle of a pitchfork while leaving the others.', {
    entity_id: z.string().describe('Entity ID of the drawing (from draw_list)'),
    index: z.coerce.number().int().min(0).describe('Point index (0-based)'),
    point: z.object({ time: z.coerce.number(), price: z.coerce.number() }).describe('New {time, price} for that point'),
  }, async ({ entity_id, index, point }) => {
    try { return jsonResult(await core.changePoint({ entity_id, index, point })); }
    catch (err) { return jsonResult({ success: false, error: err.message, code: err.code }, true); }
  });

  server.tool('draw_position', 'Draw a Risk/Reward LONG or SHORT position tool natively at the current bar, with entry, stop-loss and take-profit set to exact prices IN ONE CALL. This is the ONLY correct way to visualize a proposed trade — do NOT use horizontal_line or rectangle for trade setups. Direction is auto-detected from prices (long: sl < entry < tp, short: sl > entry > tp). Symbol tick size is read automatically from symbolInfo.pricescale/minmov so this works for crypto (BTC tick 0.01), futures (MNQ/MES tick 0.25), forex, and stocks. REJECTS setups with R:R < 2 by default (pass min_rr to override, not recommended).', {
    entry: z.coerce.number().describe('Entry price'),
    sl: z.coerce.number().describe('Stop-loss price'),
    tp: z.coerce.number().describe('Take-profit price'),
    direction: z.enum(['long', 'short']).optional().describe('long | short. If omitted, auto-detected from the price order.'),
    risk_pct: z.coerce.number().optional().describe('Risk % for the info block qty calc (default 1)'),
    account_size: z.coerce.number().optional().describe('Account size for info block qty calc (default 10000)'),
    min_rr: z.coerce.number().optional().describe('Minimum risk/reward ratio gate (default 2). Setups below this are rejected.'),
  }, async ({ entry, sl, tp, direction, risk_pct, account_size, min_rr }) => {
    try { return jsonResult(await core.drawPosition({ entry, sl, tp, direction, risk_pct, account_size, min_rr })); }
    catch (err) { return jsonResult({ success: false, error: err.message, code: err.code, details: err.details }, true); }
  });

  server.tool('draw_move', 'Translate a drawing by a relative delta in time and/or price. Works for any multi-point shape — offsets every point equally.', {
    entity_id: z.string().describe('Entity ID of the drawing (from draw_list)'),
    delta_time: z.coerce.number().optional().describe('Time offset in seconds (positive = right/newer, negative = left/older)'),
    delta_price: z.coerce.number().optional().describe('Price offset (positive = up, negative = down)'),
  }, async ({ entity_id, delta_time, delta_price }) => {
    try { return jsonResult(await core.moveShape({ entity_id, delta_time, delta_price })); }
    catch (err) { return jsonResult({ success: false, error: err.message, code: err.code }, true); }
  });
}
