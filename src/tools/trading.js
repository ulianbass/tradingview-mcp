import { z } from "zod";
import { jsonResult } from "./_format.js";
import * as core from "../core/trading.js";

export function registerTradingTools(server) {
  server.tool(
    "trading_get_positions",
    "READ-ONLY. Get currently open positions from the Trading Panel (if visible). Does NOT execute trades — only observes. Returns raw cell text from each row.",
    {},
    async () => {
      try {
        return jsonResult(await core.getPositions());
      } catch (err) {
        return jsonResult({ success: false, error: err.message, code: err.code }, true);
      }
    },
  );

  server.tool(
    "trading_get_orders",
    "READ-ONLY. Get pending/working orders from the Trading Panel (if visible). Does NOT execute, modify, or cancel orders — only observes.",
    {},
    async () => {
      try {
        return jsonResult(await core.getOrders());
      } catch (err) {
        return jsonResult({ success: false, error: err.message, code: err.code }, true);
      }
    },
  );
}
