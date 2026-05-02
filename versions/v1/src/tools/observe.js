import { z } from "zod";
import { jsonResult } from "./_format.js";
import * as core from "../core/observe.js";
import * as snapshot from "../core/tradeSnapshot.js";

export function registerObserveTools(server) {
  server.tool(
    "chart_observe",
    "Unified chart observation — returns state, quote, price action, indicator values, and pine drawings in a single call. USE THIS as the first call when asked to analyze the chart. Reduces 5+ round-trips to 1.",
    {
      include_screenshot: z.boolean().optional().describe("Also capture a chart screenshot (adds latency, off by default)"),
      include_pine_drawings: z.boolean().optional().describe("Include pine lines/labels/tables/boxes from custom indicators (default true)"),
      ohlcv_count: z.number().optional().describe("Number of bars to summarize (default 50)"),
      pine_filter: z.string().optional().describe("Filter pine drawings by indicator name substring"),
    },
    async (args = {}) => {
      try {
        return jsonResult(await core.observe(args));
      } catch (err) {
        return jsonResult({ success: false, error: err.message, code: err.code }, true);
      }
    },
  );

  server.tool(
    "trade_snapshot",
    "FAST PATH for scalping / market-order setups. Returns quote, OHLCV summary, indicator values, chart context (including last_index for draw_position), AND open positions + pending orders — all in ONE round-trip over CDP (~50-150ms vs the ~1500ms it takes to call chart_get_state + quote_get + data_get_ohlcv + data_get_study_values + trading_get_positions + trading_get_orders sequentially). Auto-opens the Account Manager panel if it's collapsed. Sets `ready_to_trade: true` only when panel is readable AND there are 0 open positions AND 0 pending orders. USE THIS as the first and only observation call before firing a scalp.",
    {
      ohlcv_count: z.coerce.number().int().min(1).max(500).optional().describe("Bars to include in the OHLCV summary (default 20, last 5 kept in full)"),
      include_positions: z.boolean().optional().describe("Scrape positions/orders from the Account Manager panel (default true). Set false if you only need chart data and want to skip the panel open."),
    },
    async (args = {}) => {
      try {
        return jsonResult(await snapshot.tradeSnapshot(args));
      } catch (err) {
        return jsonResult({ success: false, error: err.message, code: err.code }, true);
      }
    },
  );
}
