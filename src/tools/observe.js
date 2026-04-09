import { z } from "zod";
import { jsonResult } from "./_format.js";
import * as core from "../core/observe.js";

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
}
