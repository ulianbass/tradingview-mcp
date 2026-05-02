/**
 * chart_observe — unified "give me the whole picture" tool.
 *
 * Combines state, quote, OHLCV summary, study values, pine drawings,
 * and optional screenshot into a single call. Designed to be the first
 * tool Claude reaches for when asked "what's on my chart?".
 *
 * Reduces 5-6 round-trips to 1.
 */
import * as chart from './chart.js';
import * as data from './data.js';
import * as capture from './capture.js';
import { ErrorCollector } from '../errors.js';

/**
 * Observe the current chart state in one call.
 *
 * @param {object} opts
 * @param {boolean} opts.include_screenshot - attach a chart screenshot path
 * @param {boolean} opts.include_pine_drawings - include pine lines/labels/tables/boxes
 * @param {number} opts.ohlcv_count - how many bars to summarize (default 50)
 * @param {string} opts.pine_filter - study filter for pine drawings
 */
export async function observe({
  include_screenshot = false,
  include_pine_drawings = true,
  ohlcv_count = 50,
  pine_filter = '',
} = {}) {
  const errors = new ErrorCollector();
  const result = { success: true };

  // 1. Chart state (symbol, timeframe, indicators)
  try {
    const state = await chart.getState();
    result.state = {
      symbol: state.symbol,
      resolution: state.resolution,
      chart_type: state.chartType,
      indicators: state.studies || [],
    };
  } catch (e) {
    errors.add('state', e.code || 'STATE_ERROR', e.message);
    result.state = null;
  }

  // 2. Current quote
  try {
    const quote = await data.getQuote({});
    result.quote = {
      last: quote.last || quote.close,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      volume: quote.volume,
      bid: quote.bid,
      ask: quote.ask,
      time: quote.time,
    };
  } catch (e) {
    errors.add('quote', e.code || 'QUOTE_ERROR', e.message);
    result.quote = null;
  }

  // 3. OHLCV summary
  try {
    const ohlcv = await data.getOhlcv({ count: ohlcv_count, summary: true });
    result.price_action = {
      bar_count: ohlcv.bar_count,
      range_high: ohlcv.high,
      range_low: ohlcv.low,
      range: ohlcv.range,
      change: ohlcv.change,
      change_pct: ohlcv.change_pct,
      avg_volume: ohlcv.avg_volume,
    };
  } catch (e) {
    errors.add('price_action', e.code || 'OHLCV_ERROR', e.message);
    result.price_action = null;
  }

  // 4. Indicator values
  try {
    const studyValues = await data.getStudyValues();
    result.indicator_values = studyValues.studies || [];
  } catch (e) {
    errors.add('indicator_values', e.code || 'STUDY_VALUES_ERROR', e.message);
    result.indicator_values = [];
  }

  // 5. Pine drawings (optional but on by default)
  if (include_pine_drawings) {
    result.pine_drawings = {};
    const pineTools = [
      { key: 'lines', fn: () => data.getPineLines({ study_filter: pine_filter }) },
      { key: 'labels', fn: () => data.getPineLabels({ study_filter: pine_filter }) },
      { key: 'tables', fn: () => data.getPineTables({ study_filter: pine_filter }) },
      { key: 'boxes', fn: () => data.getPineBoxes({ study_filter: pine_filter }) },
    ];
    for (const { key, fn } of pineTools) {
      try {
        const r = await fn();
        if (r.study_count > 0) result.pine_drawings[key] = r.studies;
      } catch (e) {
        errors.add(`pine_${key}`, e.code || 'PINE_ERROR', e.message);
      }
    }
    if (Object.keys(result.pine_drawings).length === 0) {
      result.pine_drawings = null;
    }
  }

  // 6. Screenshot (optional — off by default because it's the largest payload)
  if (include_screenshot) {
    try {
      const shot = await capture.captureScreenshot({ region: 'chart' });
      result.screenshot = { file_path: shot.file_path, size_bytes: shot.size_bytes };
    } catch (e) {
      errors.add('screenshot', e.code || 'SCREENSHOT_ERROR', e.message);
      result.screenshot = null;
    }
  }

  if (errors.hasErrors()) {
    result.partial_errors = errors.toArray();
    result.success = result.state !== null; // still success if we got basic state
  }

  return result;
}
