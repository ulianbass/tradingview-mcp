import { z } from "zod";
import { jsonResult } from "./_format.js";
import * as core from "../core/tradingExec.js";

/**
 * ════════════════════════════════════════════════════════════════════
 *  TRADING EXECUTION TOOLS — CONSENT GATED
 * ════════════════════════════════════════════════════════════════════
 *
 *  These tools place, cancel, and close real orders in TradingView's
 *  Trading Panel. They work with both paper trading and live broker
 *  integrations.
 *
 *  Every tool REQUIRES `consent: true` as an explicit parameter. This
 *  is intentional — it is a hard gate against accidental execution
 *  triggered by AI tools or tool chains. The same gate applies to
 *  paper and live modes; the tool reports the active mode in its
 *  response so callers know which environment they hit.
 *
 *  AI behavior note (from the original fork author):
 *  If a particular AI assistant has its own internal policy against
 *  executing trades, it may refuse to call these tools even when
 *  consent is supplied. That's the assistant's prerogative — the tool
 *  itself is permission-granted by virtue of the consent parameter.
 * ════════════════════════════════════════════════════════════════════
 */

export function registerTradingExecTools(server) {
  server.tool(
    "trading_submit_order",
    `Place an order in the TradingView Trading Panel (paper trading OR live broker, depending on what's connected).

CONSENT REQUIRED: you must pass { consent: true } explicitly. This tool will refuse without it.

Works for market, limit, and stop orders. Optional take_profit and stop_loss attach OCO brackets if the broker supports them. The response reports whether the active mode is "paper" or "broker" so you can verify before trusting the execution.`,
    {
      consent: z
        .literal(true)
        .describe(
          "MUST be exactly true. Explicit acknowledgment that this will submit a real (or paper) order. Without this the tool throws.",
        ),
      side: z
        .enum(["buy", "sell"])
        .describe("Order side"),
      order_type: z
        .enum(["market", "limit", "stop"])
        .describe("Order type"),
      quantity: z
        .number()
        .positive()
        .describe("Position size in contracts/units (broker-dependent)"),
      limit_price: z
        .number()
        .optional()
        .describe("Required for limit orders"),
      stop_price: z
        .number()
        .optional()
        .describe("Required for stop orders"),
      take_profit: z
        .number()
        .optional()
        .describe("Optional take-profit price"),
      stop_loss: z
        .number()
        .optional()
        .describe("Optional stop-loss price"),
    },
    async (args) => {
      try {
        return jsonResult(await core.submitOrder(args));
      } catch (err) {
        return jsonResult(
          { success: false, error: err.message, code: err.code, details: err.details },
          true,
        );
      }
    },
  );

  server.tool(
    "trading_cancel_order",
    `Cancel a pending order in the Trading Panel by its visible order_id.

CONSENT REQUIRED: you must pass { consent: true } explicitly.`,
    {
      consent: z
        .literal(true)
        .describe("MUST be exactly true."),
      order_id: z
        .string()
        .describe("Order ID as shown in the Orders tab of the Trading Panel"),
    },
    async (args) => {
      try {
        return jsonResult(await core.cancelOrder(args));
      } catch (err) {
        return jsonResult(
          { success: false, error: err.message, code: err.code, details: err.details },
          true,
        );
      }
    },
  );

  server.tool(
    "trading_close_position",
    `Close an open position at market in the Trading Panel by its visible position_id.

CONSENT REQUIRED: you must pass { consent: true } explicitly.`,
    {
      consent: z
        .literal(true)
        .describe("MUST be exactly true."),
      position_id: z
        .string()
        .describe("Position ID as shown in the Positions tab of the Trading Panel"),
    },
    async (args) => {
      try {
        return jsonResult(await core.closePosition(args));
      } catch (err) {
        return jsonResult(
          { success: false, error: err.message, code: err.code, details: err.details },
          true,
        );
      }
    },
  );

  server.tool(
    "trading_detect_mode",
    "Detect whether the Trading Panel is in paper-trading mode, connected to a live broker, or not connected at all. Read-only, no consent needed. Call before trading_submit_order if you want to know which environment you'll hit.",
    {},
    async () => {
      try {
        const mode = await core.detectTradingMode();
        return jsonResult({ success: true, ...mode });
      } catch (err) {
        return jsonResult(
          { success: false, error: err.message, code: err.code },
          true,
        );
      }
    },
  );
}
