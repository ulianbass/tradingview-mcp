import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerHealthTools } from "./tools/health.js";
import { registerChartTools } from "./tools/chart.js";
import { registerPineTools } from "./tools/pine.js";
import { registerDataTools } from "./tools/data.js";
import { registerCaptureTools } from "./tools/capture.js";
import { registerDrawingTools } from "./tools/drawing.js";
import { registerAlertTools } from "./tools/alerts.js";
import { registerBatchTools } from "./tools/batch.js";
import { registerReplayTools } from "./tools/replay.js";
import { registerIndicatorTools } from "./tools/indicators.js";
import { registerWatchlistTools } from "./tools/watchlist.js";
import { registerUiTools } from "./tools/ui.js";
import { registerPaneTools } from "./tools/pane.js";
import { registerTabTools } from "./tools/tab.js";
import { registerMorningTools } from "./tools/morning.js";
import { registerObserveTools } from "./tools/observe.js";
import { registerStreamTools } from "./tools/stream.js";
import { registerTradingTools } from "./tools/trading.js";
import { registerTradingExecTools } from "./tools/tradingExec.js";

const server = new McpServer(
  {
    name: "tradingview",
    version: "1.0.0",
    description:
      "AI-assisted TradingView chart analysis and Pine Script development via Chrome DevTools Protocol",
  },
  {
    instructions: `TradingView MCP — 80+ tools for reading and controlling a live TradingView Desktop chart.

═══════════════════════════════════════════════════════════════════════
MANDATORY RULES — these apply to ALL clients (Claude Code, Codex,
Claude Desktop, mcp-inspector, custom SDK clients). Do not skip them.
═══════════════════════════════════════════════════════════════════════

RULE 1 — SCALPING FAST PATH (2 calls, not 6).
When the user asks to analyze a market and open a position (scalp,
market order, swing entry, reversal, etc.), DO NOT call chart_get_state
+ quote_get + data_get_ohlcv + data_get_study_values +
trading_get_positions + trading_get_orders one by one. That flow is
1-2 seconds of CDP round-trips and a market order cannot wait that
long. Instead use this 2-call sequence:

  (1) trade_snapshot  → ONE round-trip, ~3 ms of in-page JS. Returns
      chart context (symbol, resolution, last_index, pricescale,
      minmov), quote, ohlcv summary + last 5 bars, every visible
      indicator's values, positions, orders, and a ready_to_trade
      flag. Auto-opens the Account Manager panel if collapsed.
  (2) draw_position   → ONE round-trip. Creates the native
      LineToolRiskRewardLong / Short with entry, SL and TP set to
      exact prices in one shot.

RULE 2 — CHECK POSITIONS BEFORE PROPOSING A TRADE.
trade_snapshot returns positions + orders. Before proposing or drawing
any new trade:
- If positions.panel_open is false → tell the user you couldn't read
  the Account Manager and stop. Do NOT guess.
- If positions.count > 0 → the user already has an open position.
  Report the row(s) from positions.items and ask whether the new trade
  should replace it, add to it, or be cancelled. Do NOT silently stack
  a new trade on top.
- If orders.count > 0 → same rule for pending orders.
- If ready_to_trade is true → proceed to draw_position. No extra
  confirmation round-trips.

RULE 3 — MINIMUM RISK:REWARD IS 1:2, ENFORCED IN CODE.
draw_position REJECTS any setup with rr < 2 by default (DEFAULT_MIN_RR
= 2 in src/core/drawing.js). The tool will throw INVALID_INPUT with a
message like "Risk/reward 1.5 is below the minimum 2". When this
happens, RE-PLAN the trade with a tighter SL, a wider TP, or skip the
setup entirely. Do NOT pass min_rr: 1 to bypass the gate unless the
user has EXPLICITLY authorized a worse ratio for that specific trade.

RULE 4 — NEVER DRAW TRADE SETUPS WITH LINES OR RECTANGLES.
For any trade setup (long, short, scalp, swing, breakout, reversal),
use draw_position — NEVER horizontal_line, rectangle, or trend_line.
The native Risk/Reward tool shows entry, TP box, SL box, qty, R:R
ratio, and $ amounts automatically. draw_shape is only for marking
levels or zones that are NOT part of a trade proposal.

RULE 5 — READ-ONLY ON TRADE EXECUTION.
trading_get_positions, trading_get_orders, and trade_snapshot are
read-only. Execution of any trade (market, limit, stop, close, modify,
cancel) must be done by the user directly. If the user explicitly
authorizes an order, use trading_submit_order with consent: true and
verify trading_detect_mode first — never on a live broker without
explicit per-trade authorization.

═══════════════════════════════════════════════════════════════════════
TOOL SELECTION GUIDE (non-scalping / deep research paths):
═══════════════════════════════════════════════════════════════════════

Reading your chart:
- chart_observe       → unified state + quote + ohlcv + indicators in
                        one call (slower than trade_snapshot but does
                        not touch the trading panel).
- chart_get_state     → symbol, timeframe, all indicator names + IDs.
- data_get_study_values → numeric values from ALL visible indicators.
- quote_get           → real-time price snapshot.
- data_get_ohlcv      → price bars. ALWAYS pass summary=true unless
                        you need individual bars.

Reading custom Pine indicator output (line.new/label.new/table.new/
box.new drawings):
- data_get_pine_lines   → horizontal price levels (deduplicated).
- data_get_pine_labels  → text annotations with prices.
- data_get_pine_tables  → table data as formatted rows.
- data_get_pine_boxes   → price zones as {high, low} pairs.
- ALWAYS pass study_filter to target a specific indicator.
- Indicators must be VISIBLE on chart for these to work.

Changing the chart:
- chart_set_symbol, chart_set_timeframe, chart_set_type
- chart_manage_indicator → use FULL NAMES: "Relative Strength Index"
  not "RSI", "Moving Average Exponential" not "EMA".
- chart_scroll_to_date, chart_set_visible_range, indicator_set_inputs

Pine Script development:
- pine_set_source → inject code; pine_smart_compile → compile + check
- pine_get_errors, pine_get_console
- WARNING: pine_get_source can return 200KB+ — avoid unless editing.

Other: capture_screenshot, replay_*, batch_run, alert_*, tv_launch,
pane_*, tab_*, watchlist_*, morning_brief, stream_*.

CONTEXT MANAGEMENT:
- ALWAYS use summary=true on data_get_ohlcv.
- ALWAYS use study_filter on pine tools when targeting one indicator.
- NEVER use verbose=true unless the user asks for raw data.
- Prefer capture_screenshot over pulling large datasets for visual
  context.
- Call chart_get_state ONCE at start; reuse entity IDs.`,
  },
);

// Register all tool groups
registerHealthTools(server);
registerChartTools(server);
registerPineTools(server);
registerDataTools(server);
registerCaptureTools(server);
registerDrawingTools(server);
registerAlertTools(server);
registerBatchTools(server);
registerReplayTools(server);
registerIndicatorTools(server);
registerWatchlistTools(server);
registerUiTools(server);
registerPaneTools(server);
registerTabTools(server);
registerMorningTools(server);
registerObserveTools(server);
registerStreamTools(server);
registerTradingTools(server);
registerTradingExecTools(server);

// Startup notice (stderr so it doesn't interfere with MCP stdio protocol)
process.stderr.write(
  "⚠  tradingview-mcp  |  Unofficial tool. Not affiliated with TradingView Inc. or Anthropic.\n",
);
process.stderr.write(
  "   Ensure your usage complies with TradingView's Terms of Use.\n\n",
);

// Graceful shutdown
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// Start stdio transport
const transport = new StdioServerTransport();
try {
  await server.connect(transport);
} catch (err) {
  process.stderr.write(`Failed to start MCP server: ${err.message}\n`);
  process.exit(1);
}
