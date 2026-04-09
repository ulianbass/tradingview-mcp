/**
 * Core chart control logic.
 */
import { evaluate, evaluateAsync } from '../connection.js';
import { waitForChart, waitForStudyDelta, sleep } from '../await.js';
import { escapeJsString, validateNumber } from '../sanitize.js';
import { ErrorCodes } from '../errors.js';

const CHART_API = 'window.TradingViewApi._activeChartWidgetWV.value()';

export async function getState() {
  const state = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var studies = [];
      try {
        var allStudies = chart.getAllStudies();
        studies = allStudies.map(function(s) {
          return { id: s.id, name: s.name || s.title || 'unknown' };
        });
      } catch(e) {}
      return {
        symbol: chart.symbol(),
        resolution: chart.resolution(),
        chartType: chart.chartType(),
        studies: studies,
      };
    })()
  `);
  return { success: true, ...state };
}

export async function setSymbol({ symbol }) {
  const escaped = escapeJsString(symbol);
  await evaluate(`${CHART_API}.setSymbol('${escaped}', {})`);
  const ready = await waitForChart({ expectedSymbol: symbol });
  return {
    success: ready.ok,
    symbol,
    chart_ready: ready.ok,
    elapsed_ms: ready.elapsed_ms,
    code: ready.ok ? undefined : ready.code,
  };
}

export async function setTimeframe({ timeframe }) {
  const escaped = escapeJsString(timeframe);
  await evaluate(`${CHART_API}.setResolution('${escaped}', {})`);
  const ready = await waitForChart({ expectedResolution: timeframe });
  return {
    success: ready.ok,
    timeframe,
    chart_ready: ready.ok,
    elapsed_ms: ready.elapsed_ms,
    code: ready.ok ? undefined : ready.code,
  };
}

export async function setType({ chart_type }) {
  const typeMap = {
    'Bars': 0, 'Candles': 1, 'Line': 2, 'Area': 3,
    'Renko': 4, 'Kagi': 5, 'PointAndFigure': 6, 'LineBreak': 7,
    'HeikinAshi': 8, 'HollowCandles': 9,
  };
  const typeNum = typeMap[chart_type] ?? Number(chart_type);
  if (isNaN(typeNum)) {
    throw new Error(`Unknown chart type: ${chart_type}. Use a name (Candles, Line, etc.) or number (0-9).`);
  }
  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      chart.setChartType(${typeNum});
    })()
  `);
  return { success: true, chart_type, type_num: typeNum };
}

export async function manageIndicator({ action, indicator, entity_id, inputs: inputsRaw }) {
  let inputs;
  if (inputsRaw) {
    if (typeof inputsRaw === 'string') {
      try { inputs = JSON.parse(inputsRaw); } catch (e) { throw new Error(`Invalid JSON for inputs: ${e.message}`); }
    } else { inputs = inputsRaw; }
  }

  if (action === 'add') {
    const inputArr = inputs ? Object.entries(inputs).map(([k, v]) => ({ id: k, value: v })) : [];
    const before = await evaluate(`${CHART_API}.getAllStudies().map(function(s) { return s.id; })`);
    const beforeCount = (before || []).length;
    const escapedIndicator = escapeJsString(indicator);
    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        chart.createStudy('${escapedIndicator}', false, false, ${JSON.stringify(inputArr)});
      })()
    `);
    // Wait for the study count to increase instead of a blind 1500ms sleep
    const waited = await waitForStudyDelta(beforeCount, 1, { timeout: 8000 });
    const after = await evaluate(`${CHART_API}.getAllStudies().map(function(s) { return s.id; })`);
    const newIds = (after || []).filter(id => !(before || []).includes(id));
    return {
      success: newIds.length > 0,
      action: 'add',
      indicator,
      entity_id: newIds[0] || null,
      new_study_count: newIds.length,
      elapsed_ms: waited.elapsed_ms,
      timed_out: !waited.ok,
    };
  } else if (action === 'remove') {
    if (!entity_id) {
      const err = new Error('entity_id required for remove action. Use chart_get_state to find study IDs.');
      err.code = ErrorCodes.INVALID_INPUT;
      throw err;
    }
    const beforeCount = await evaluate(`${CHART_API}.getAllStudies().length`);
    const escapedEntityId = escapeJsString(entity_id);
    await evaluate(`
      (function() {
        var chart = ${CHART_API};
        chart.removeEntity('${escapedEntityId}');
      })()
    `);
    const waited = await waitForStudyDelta(beforeCount, -1, { timeout: 5000 });
    return { success: waited.ok, action: 'remove', entity_id, elapsed_ms: waited.elapsed_ms };
  } else {
    const err = new Error('action must be "add" or "remove"');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
}

export async function getVisibleRange() {
  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      return { visible_range: chart.getVisibleRange(), bars_range: chart.getVisibleBarsRange() };
    })()
  `);
  return { success: true, visible_range: result.visible_range, bars_range: result.bars_range };
}

export async function setVisibleRange({ from, to }) {
  const fromNum = validateNumber(from, 'from');
  const toNum = validateNumber(to, 'to');
  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var m = chart._chartWidget.model();
      var ts = m.timeScale();
      var bars = m.mainSeries().bars();
      var startIdx = bars.firstIndex();
      var endIdx = bars.lastIndex();
      var fromIdx = startIdx, toIdx = endIdx;
      for (var i = startIdx; i <= endIdx; i++) {
        var v = bars.valueAt(i);
        if (v && v[0] >= ${fromNum} && fromIdx === startIdx) fromIdx = i;
        if (v && v[0] <= ${toNum}) toIdx = i;
      }
      ts.zoomToBarsRange(fromIdx, toIdx);
    })()
  `);
  await sleep(300);
  const actual = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      try { var r = chart.getVisibleRange(); return { from: r.from || 0, to: r.to || 0 }; }
      catch(e) { return { from: 0, to: 0, error: e.message }; }
    })()
  `);
  return { success: true, requested: { from, to }, actual: actual || { from: 0, to: 0 } };
}

export async function scrollToDate({ date }) {
  let timestamp;
  if (/^\d+$/.test(date)) timestamp = Number(date);
  else timestamp = Math.floor(new Date(date).getTime() / 1000);
  if (isNaN(timestamp)) throw new Error(`Could not parse date: ${date}. Use ISO format (2024-01-15) or unix timestamp.`);

  const resolution = await evaluate(`${CHART_API}.resolution()`);
  let secsPerBar = 60;
  const res = String(resolution);
  if (res === 'D' || res === '1D') secsPerBar = 86400;
  else if (res === 'W' || res === '1W') secsPerBar = 604800;
  else if (res === 'M' || res === '1M') secsPerBar = 2592000;
  else { const mins = parseInt(res, 10); if (!isNaN(mins)) secsPerBar = mins * 60; }

  const halfWindow = 25 * secsPerBar;
  const scrollFrom = validateNumber(timestamp - halfWindow, 'scrollFrom');
  const scrollTo = validateNumber(timestamp + halfWindow, 'scrollTo');

  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var m = chart._chartWidget.model();
      var ts = m.timeScale();
      var bars = m.mainSeries().bars();
      var startIdx = bars.firstIndex();
      var endIdx = bars.lastIndex();
      var fromIdx = startIdx, toIdx = endIdx;
      for (var i = startIdx; i <= endIdx; i++) {
        var v = bars.valueAt(i);
        if (v && v[0] >= ${scrollFrom} && fromIdx === startIdx) fromIdx = i;
        if (v && v[0] <= ${scrollTo}) toIdx = i;
      }
      ts.zoomToBarsRange(fromIdx, toIdx);
    })()
  `);
  await sleep(300);
  return { success: true, date, centered_on: timestamp, resolution, window: { from: scrollFrom, to: scrollTo } };
}

/**
 * Pan the chart by a number of bars. Positive = right (newer), negative = left (older).
 */
export async function pan({ bars }) {
  const n = validateNumber(bars, 'bars');
  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var ts = chart._chartWidget.model().timeScale();
      try { ts.scrollToOffsetAnimated(-${n}); return true; }
      catch(e) { return { error: e.message }; }
    })()
  `);
  await sleep(200);
  return { success: true, bars_panned: n };
}

/**
 * Zoom in/out by a factor. factor > 1 = zoom in (fewer bars), factor < 1 = zoom out.
 */
export async function zoom({ factor }) {
  const f = validateNumber(factor, 'factor');
  if (f <= 0) {
    const err = new Error('factor must be positive');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  const result = await evaluate(`
    (function() {
      try {
        var chart = ${CHART_API};
        var ts = chart._chartWidget.model().timeScale();
        ts.zoom(${f});
        return { ok: true };
      } catch(e) { return { ok: false, error: e.message }; }
    })()
  `);
  await sleep(200);
  if (!result?.ok) {
    const err = new Error(`Zoom failed: ${result?.error || 'unknown'}`);
    err.code = ErrorCodes.API_NOT_AVAILABLE;
    throw err;
  }
  return { success: true, factor: f };
}

/**
 * Add a compare symbol overlay on the current chart.
 * TradingView's native "Compare" feature — draws another ticker on the
 * same pane, same axis.
 */
export async function compareSymbol({ symbol, source = 'close' }) {
  const escapedSymbol = escapeJsString(symbol);
  const escapedSource = escapeJsString(source);
  const before = await evaluate(`${CHART_API}.getAllStudies().length`);
  const result = await evaluate(`
    (function() {
      try {
        var api = ${CHART_API};
        var study = api.addOverlayStudy('Compare', [['symbol', '${escapedSymbol}'], ['source', '${escapedSource}']]);
        return { ok: true };
      } catch(e) { return { ok: false, error: e.message }; }
    })()
  `);
  if (!result?.ok) {
    const err = new Error(`Compare overlay failed: ${result?.error || 'unknown'}`);
    err.code = ErrorCodes.API_NOT_AVAILABLE;
    throw err;
  }
  const waited = await waitForStudyDelta(before, 1, { timeout: 5000 });
  return {
    success: waited.ok,
    symbol,
    source,
    elapsed_ms: waited.elapsed_ms,
    note: 'Overlay added to current pane. Use chart_get_state to find its entity_id, then chart_manage_indicator to remove.',
  };
}

/**
 * Scroll to the latest bar (realtime).
 */
export async function scrollToRealtime() {
  await evaluate(`${CHART_API}._chartWidget.model().timeScale().scrollToRealtime()`);
  await sleep(150);
  return { success: true };
}

export async function symbolInfo() {
  const result = await evaluate(`
    (function() {
      var chart = ${CHART_API};
      var info = chart.symbolExt();
      return {
        symbol: info.symbol, full_name: info.full_name, exchange: info.exchange,
        description: info.description, type: info.type, pro_name: info.pro_name,
        typespecs: info.typespecs, resolution: chart.resolution(), chart_type: chart.chartType()
      };
    })()
  `);
  return { success: true, ...result };
}

export async function symbolSearch({ query, type }) {
  // Use TradingView's public symbol search REST API (works without auth)
  const params = new URLSearchParams({
    text: query,
    hl: '1',
    exchange: '',
    lang: 'en',
    search_type: type || '',
    domain: 'production',
  });

  const resp = await fetch(`https://symbol-search.tradingview.com/symbol_search/v3/?${params}`, {
    headers: { 'Origin': 'https://www.tradingview.com', 'Referer': 'https://www.tradingview.com/' },
  });
  if (!resp.ok) throw new Error(`Symbol search API returned ${resp.status}`);
  const data = await resp.json();

  const strip = s => (s || '').replace(/<\/?em>/g, '');
  const results = (data.symbols || data || []).slice(0, 15).map(r => ({
    symbol: strip(r.symbol),
    description: strip(r.description),
    exchange: r.exchange || r.prefix || '',
    type: r.type || '',
    full_name: r.exchange ? `${r.exchange}:${strip(r.symbol)}` : strip(r.symbol),
  }));

  return { success: true, query, source: 'rest_api', results, count: results.length };
}
