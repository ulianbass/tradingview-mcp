/**
 * trade_snapshot — single-evaluate fast path for scalping.
 *
 * Gives the agent EVERYTHING it needs to decide and fire a market-order
 * scalp setup in ONE round-trip over CDP, instead of 5-7 sequential
 * tool calls (chart_get_state + quote_get + data_get_ohlcv +
 * data_get_study_values + trading_get_positions + trading_get_orders +
 * draw_position).
 *
 * Returns (in ~50-150 ms total):
 *   chart      : { symbol, resolution, last_index, pricescale, minmov }
 *   quote      : { last, bid, ask, open, high, low, volume, time }
 *   ohlcv      : { bar_count, range_high, range_low, range, change,
 *                  change_pct, avg_volume, last_bars: [...] }
 *   indicators : [{ name, values: {...} }]
 *   positions  : { panel_open, count, items, empty_state }
 *   orders     : { panel_open, count, items }
 *   warnings   : [...]
 *
 * This is the FIRST tool an agent should call when asked to analyze and
 * open a scalp position. From here you already know the entry context,
 * whether the user has an open position, and the last_index needed by
 * draw_position — no additional queries required before drawing.
 */
import { evaluate } from '../connection.js';
import { Selectors } from '../selectors.js';
import { ensureAccountManagerOpen } from './trading.js';

export async function tradeSnapshot({ ohlcv_count = 20, include_positions = true } = {}) {
  const barCount = Math.max(1, Math.min(500, Math.floor(ohlcv_count)));

  // If the caller wants positions, open the Account Manager first — we
  // can't scrape tables that don't exist in the DOM. This is the only
  // round-trip outside of the big one.
  let openState = null;
  if (include_positions) {
    try { openState = await ensureAccountManagerOpen(); }
    catch (e) { openState = { opened: false, error: e.message }; }
  }

  const posSel = JSON.stringify(Selectors.tradingPositionsTable);
  const ordSel = JSON.stringify(Selectors.tradingOrdersTable);
  const emptySel = JSON.stringify(Selectors.tradingEmptyStateRow);

  // One big JS expression that walks the TradingView model directly and
  // scrapes the DOM tables in the same pass. No helper calls, no extra
  // round-trips.
  const snapshot = await evaluate(`
    (function() {
      var out = { warnings: [] };
      try {
        var widget = window.TradingViewApi._activeChartWidgetWV.value();
        var chartWidget = widget._chartWidget;
        if (!chartWidget) { out.warnings.push('no_chart_widget'); return out; }
        var model = chartWidget.model();
        var innerModel = model.model();
        var mainSeries = model.mainSeries();
        var bars = mainSeries.bars();
        var lastIdx = bars.lastIndex();
        var lastBar = bars.last();
        var si = mainSeries.symbolInfo ? mainSeries.symbolInfo() : null;

        // ---------- chart context ----------
        // widget.resolution() is on the PUBLIC wrapper, not the internal
        // _chartWidget — callers of tradeSnapshot need the current TF so
        // they can sanity-check bar context.
        out.chart = {
          symbol: (si && si.name) || null,
          resolution: (typeof widget.resolution === 'function') ? widget.resolution() : null,
          last_index: lastIdx,
          pricescale: (si && si.pricescale) || 100,
          minmov: (si && si.minmov) || 1
        };

        // ---------- quote (last bar) ----------
        if (lastBar) {
          // lastBar value format: [time, open, high, low, close, volume]
          var v = lastBar.value || lastBar;
          out.quote = {
            time: Array.isArray(v) ? v[0] : lastBar.time,
            open: Array.isArray(v) ? v[1] : lastBar.open,
            high: Array.isArray(v) ? v[2] : lastBar.high,
            low: Array.isArray(v) ? v[3] : lastBar.low,
            close: Array.isArray(v) ? v[4] : lastBar.close,
            volume: Array.isArray(v) ? v[5] : lastBar.volume
          };
          out.quote.last = out.quote.close;
        }

        // ---------- last N bars summary ----------
        var count = ${barCount};
        var firstIdx = Math.max(bars.firstIndex(), lastIdx - count + 1);
        var lastBars = [];
        var hi = -Infinity, lo = Infinity, volSum = 0, volN = 0;
        var firstClose = null, lastClose = null;
        for (var i = firstIdx; i <= lastIdx; i++) {
          var b = bars.valueAt(i);
          if (!b) continue;
          var time = b[0], o = b[1], h = b[2], l = b[3], c = b[4], vol = b[5];
          if (h > hi) hi = h;
          if (l < lo) lo = l;
          if (typeof vol === 'number') { volSum += vol; volN++; }
          if (firstClose === null) firstClose = o;
          lastClose = c;
          // Only store the last 5 bars to keep payload small
          if (i > lastIdx - 5) lastBars.push({ t: time, o: o, h: h, l: l, c: c, v: vol });
        }
        var change = (lastClose !== null && firstClose !== null) ? (lastClose - firstClose) : null;
        var changePct = (change !== null && firstClose) ? ((change / firstClose) * 100) : null;
        out.ohlcv = {
          bar_count: lastIdx - firstIdx + 1,
          range_high: isFinite(hi) ? hi : null,
          range_low: isFinite(lo) ? lo : null,
          range: (isFinite(hi) && isFinite(lo)) ? (hi - lo) : null,
          change: change,
          change_pct: changePct !== null ? +changePct.toFixed(2) + '%' : null,
          avg_volume: volN > 0 ? +(volSum / volN).toFixed(2) : null,
          last_bars: lastBars
        };

        // ---------- indicators (visible studies) ----------
        var studies = [];
        try {
          var ds = innerModel.dataSources();
          var sourcesArr = [];
          if (Array.isArray(ds)) sourcesArr = ds;
          else if (ds && typeof ds.forEach === 'function') ds.forEach(function(x) { sourcesArr.push(x); });
          for (var s = 0; s < sourcesArr.length; s++) {
            var src = sourcesArr[s];
            if (!src || typeof src.metaInfo !== 'function') continue;
            try {
              var meta = src.metaInfo();
              if (!meta || meta.is_hidden_study) continue;
              var name = src.name ? src.name() : (meta.description || 'Study');
              // Skip main series
              if (src === mainSeries) continue;
              var values = {};
              if (typeof src.getDataWindow === 'function') {
                try {
                  var dw = src.getDataWindow();
                  if (dw && dw.values) {
                    for (var k in dw.values) { values[k] = dw.values[k]; }
                  }
                } catch(e) {}
              }
              studies.push({ name: name, values: values });
            } catch(e) { /* skip broken sources */ }
          }
        } catch(e) { out.warnings.push('studies_error: ' + e.message); }
        out.indicators = studies;

        // ---------- positions + orders (DOM scrape) ----------
        ${include_positions ? `
        function scrape(selList, emptySelList) {
          var table = null;
          for (var i = 0; i < selList.length; i++) {
            table = document.querySelector(selList[i]);
            if (table) break;
          }
          if (!table) return { panel_open: false, count: 0, items: [] };
          var emptyRow = null;
          for (var e = 0; e < emptySelList.length; e++) {
            emptyRow = table.querySelector(emptySelList[e]) || document.querySelector(emptySelList[e]);
            if (emptyRow) break;
          }
          var emptyText = emptyRow ? (emptyRow.textContent || '').trim() : null;
          var headerCells = table.querySelectorAll('[data-name$="-column"]');
          var columns = [];
          var seen = {};
          for (var h = 0; h < headerCells.length; h++) {
            var dn = headerCells[h].getAttribute('data-name') || '';
            var key = dn.replace(/-column$/, '');
            if (key && !seen[key]) { seen[key] = true; columns.push(key); }
          }
          var rows = table.querySelectorAll('[class*="ka-tr"]:not([class*="thead"]):not([class*="emptyStateRow"])');
          var items = [];
          for (var r = 0; r < rows.length; r++) {
            var cells = rows[r].querySelectorAll('[class*="ka-cell"], [class*="cell"], td');
            if (!cells.length) continue;
            var labeled = {};
            var any = false;
            for (var c = 0; c < cells.length; c++) {
              var txt = (cells[c].textContent || '').trim();
              if (c < columns.length) labeled[columns[c]] = txt;
              if (txt) any = true;
            }
            if (any) items.push(labeled);
          }
          return { panel_open: true, count: items.length, items: items, empty_state: emptyText };
        }
        out.positions = scrape(${posSel}, ${emptySel});
        out.orders = scrape(${ordSel}, ${emptySel});
        ` : ''}

        return out;
      } catch (e) {
        out.error = e.message;
        return out;
      }
    })()
  `);

  if (snapshot?.error) {
    return { success: false, error: snapshot.error, ...snapshot };
  }

  // Compute a ready_to_trade flag — true only when we could read the
  // panel AND there is no open position or pending order.
  const ready =
    (!include_positions) ||
    (snapshot?.positions?.panel_open && (snapshot?.positions?.count || 0) === 0 &&
     (snapshot?.orders?.count || 0) === 0);

  return {
    success: true,
    ready_to_trade: ready,
    auto_opened_panel: openState?.opened || false,
    ...snapshot,
  };
}
