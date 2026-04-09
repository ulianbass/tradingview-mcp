/**
 * Stream buffer — turns the fire-and-forget streaming model into a
 * request/response-friendly "start → read → stop" API for MCP tools.
 *
 * Claude calls `stream_start` with a kind (quote, bars, values, etc.),
 * gets a stream_id, then polls `stream_read` to drain accumulated events.
 * `stream_stop` releases the buffer.
 *
 * This is how we expose "live view" semantics inside MCP's
 * request/response transport.
 */
import { evaluate } from '../connection.js';
import { sleep } from '../await.js';
import { ErrorCodes } from '../errors.js';

const CHART_API = 'window.TradingViewApi._activeChartWidgetWV.value()';
const MAX_BUFFER_SIZE = 500; // drop oldest beyond this

const streams = new Map(); // stream_id → { kind, interval, buffer, running, lastHash }
let nextId = 1;

function makeId() {
  return `stream_${Date.now().toString(36)}_${nextId++}`;
}

/**
 * Per-kind fetchers. Each returns null if there's no data, or an object.
 */
const FETCHERS = {
  quote: async () => {
    return evaluate(`
      (function() {
        try {
          var chart = ${CHART_API};
          var bars = chart._chartWidget.model().mainSeries().bars();
          var v = bars.valueAt(bars.lastIndex());
          if (!v) return null;
          return { symbol: chart.symbol(), time: v[0], open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5] || 0 };
        } catch(e) { return { error: e.message }; }
      })()
    `);
  },
  values: async () => {
    return evaluate(`
      (function() {
        try {
          var chart = ${CHART_API}._chartWidget;
          var sources = chart.model().model().dataSources();
          var results = [];
          for (var i = 0; i < sources.length; i++) {
            var s = sources[i];
            if (!s.metaInfo || !s.dataWindowView) continue;
            try {
              var name = s.metaInfo().description || s.metaInfo().shortDescription || '';
              if (!name) continue;
              var dwv = s.dataWindowView();
              if (!dwv) continue;
              var items = dwv.items();
              if (!items) continue;
              var vals = {};
              for (var j = 0; j < items.length; j++) {
                var it = items[j];
                if (it._value && it._value !== '∅' && it._title) vals[it._title] = it._value;
              }
              if (Object.keys(vals).length > 0) results.push({ name: name, values: vals });
            } catch(e) {}
          }
          return { studies: results };
        } catch(e) { return { error: e.message }; }
      })()
    `);
  },
  bars: async () => {
    return evaluate(`
      (function() {
        try {
          var chart = ${CHART_API};
          var bars = chart._chartWidget.model().mainSeries().bars();
          var last = bars.lastIndex();
          var v = bars.valueAt(last);
          if (!v) return null;
          return { symbol: chart.symbol(), resolution: chart.resolution(), bar_time: v[0], open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5] || 0, bar_index: last };
        } catch(e) { return { error: e.message }; }
      })()
    `);
  },
};

/**
 * Start a streaming buffer. Returns a stream_id.
 */
export async function streamStart({ kind, interval_ms = 500 } = {}) {
  if (!FETCHERS[kind]) {
    const err = new Error(`Unknown stream kind: ${kind}. Use one of: ${Object.keys(FETCHERS).join(', ')}`);
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  const id = makeId();
  const state = {
    id,
    kind,
    interval_ms: Math.max(100, Number(interval_ms) || 500),
    buffer: [],
    running: true,
    lastHash: null,
    started_at: Date.now(),
    errors: 0,
  };
  streams.set(id, state);

  // Fire-and-forget poll loop
  (async () => {
    while (state.running) {
      try {
        const data = await FETCHERS[kind]();
        if (data) {
          const hash = JSON.stringify(data);
          if (hash !== state.lastHash) {
            state.lastHash = hash;
            state.buffer.push({ ...data, _ts: Date.now() });
            if (state.buffer.length > MAX_BUFFER_SIZE) {
              state.buffer.splice(0, state.buffer.length - MAX_BUFFER_SIZE);
            }
          }
        }
      } catch (e) {
        state.errors++;
      }
      await sleep(state.interval_ms);
    }
  })();

  return { success: true, stream_id: id, kind, interval_ms: state.interval_ms };
}

/**
 * Drain the buffer for a stream. Returns all accumulated events since
 * last read, then clears the buffer.
 */
export async function streamRead({ stream_id } = {}) {
  const state = streams.get(stream_id);
  if (!state) {
    const err = new Error(`Unknown stream_id: ${stream_id}`);
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  const events = state.buffer.slice();
  state.buffer.length = 0;
  return {
    success: true,
    stream_id,
    kind: state.kind,
    event_count: events.length,
    events,
    running: state.running,
    error_count: state.errors,
    age_ms: Date.now() - state.started_at,
  };
}

/**
 * Stop a stream and remove its buffer.
 */
export async function streamStop({ stream_id } = {}) {
  const state = streams.get(stream_id);
  if (!state) {
    return { success: true, stream_id, already_stopped: true };
  }
  state.running = false;
  const remaining = state.buffer.length;
  streams.delete(stream_id);
  return {
    success: true,
    stream_id,
    kind: state.kind,
    duration_ms: Date.now() - state.started_at,
    remaining_events_discarded: remaining,
  };
}

/**
 * List all active streams.
 */
export async function streamList() {
  const list = Array.from(streams.values()).map((s) => ({
    stream_id: s.id,
    kind: s.kind,
    interval_ms: s.interval_ms,
    buffer_size: s.buffer.length,
    running: s.running,
    error_count: s.errors,
    age_ms: Date.now() - s.started_at,
  }));
  return { success: true, stream_count: list.length, streams: list };
}
