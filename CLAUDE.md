# TradingView MCP — Claude Instructions

68 tools for reading and controlling a live TradingView Desktop chart via CDP (port 9222).

## Decision Tree — Which Tool When

### "What's on my chart right now?"
1. `chart_get_state` → symbol, timeframe, chart type, list of all indicators with entity IDs
2. `data_get_study_values` → current numeric values from all visible indicators (RSI, MACD, BBands, EMAs, etc.)
3. `quote_get` → real-time price, OHLC, volume for current symbol

### "What levels/lines/labels are showing?"
Custom Pine indicators draw with `line.new()`, `label.new()`, `table.new()`, `box.new()`. These are invisible to normal data tools. Use:

1. `data_get_pine_lines` → horizontal price levels drawn by indicators (deduplicated, sorted high→low)
2. `data_get_pine_labels` → text annotations with prices (e.g., "PDH 24550", "Bias Long ✓")
3. `data_get_pine_tables` → table data formatted as rows (e.g., session stats, analytics dashboards)
4. `data_get_pine_boxes` → price zones / ranges as {high, low} pairs

Use `study_filter` parameter to target a specific indicator by name substring (e.g., `study_filter: "Profiler"`).

### "Give me price data"
- `data_get_ohlcv` with `summary: true` → compact stats (high, low, range, change%, avg volume, last 5 bars)
- `data_get_ohlcv` without summary → all bars (use `count` to limit, default 100)
- `quote_get` → single latest price snapshot

### "Analyze my chart" (full report workflow)
1. `quote_get` → current price
2. `data_get_study_values` → all indicator readings
3. `data_get_pine_lines` → key price levels from custom indicators
4. `data_get_pine_labels` → labeled levels with context (e.g., "Settlement", "ASN O/U")
5. `data_get_pine_tables` → session stats, analytics tables
6. `data_get_ohlcv` with `summary: true` → price action summary
7. `capture_screenshot` → visual confirmation

### "Change the chart"
- `chart_set_symbol` → switch ticker (e.g., "AAPL", "ES1!", "NYMEX:CL1!")
- `chart_set_timeframe` → switch resolution (e.g., "1", "5", "15", "60", "D", "W")
- `chart_set_type` → switch chart style (Candles, HeikinAshi, Line, Area, Renko, etc.)
- `chart_manage_indicator` → add or remove studies (use full name: "Relative Strength Index", not "RSI")
- `chart_scroll_to_date` → jump to a date (ISO format: "2025-01-15")
- `chart_set_visible_range` → zoom to exact date range (unix timestamps)

### "Work on Pine Script"
1. `pine_set_source` → inject code into editor
2. `pine_smart_compile` → compile with auto-detection + error check
3. `pine_get_errors` → read compilation errors
4. `pine_get_console` → read log.info() output
5. `pine_get_source` → read current code back (WARNING: can be very large for complex scripts)
6. `pine_save` → save to TradingView cloud
7. `pine_new` → create blank indicator/strategy/library
8. `pine_open` → load a saved script by name

### "Practice trading with replay"
1. `replay_start` with `date: "2025-03-01"` → enter replay mode
2. `replay_step` → advance one bar
3. `replay_autoplay` → auto-advance (set speed with `speed` param in ms)
4. `replay_trade` with `action: "buy"/"sell"/"close"` → execute trades
5. `replay_status` → check position, P&L, current date
6. `replay_stop` → return to realtime

### "Screen multiple symbols"
- `batch_run` with `symbols: ["ES1!", "NQ1!", "YM1!"]` and `action: "screenshot"` or `"get_ohlcv"`

### "Analyze and propose a scalp / market-order trade" — USE trade_snapshot FIRST
**MANDATORY SCALPING FAST PATH**: for any request that looks like "analyze X and tell me where to enter / scalp X / open a position on X", follow this 2-call sequence. Total latency target: under 300 ms.

1. **`trade_snapshot`** — one single CDP round-trip (~50-150 ms) that returns:
   - `chart` → symbol, resolution, last_index, pricescale, minmov
   - `quote` → last/open/high/low/volume/time of the current bar
   - `ohlcv` → range, change %, avg volume, and the last 5 raw bars
   - `indicators` → values of every visible study (RSI, MACD, ...)
   - `positions` → `{ panel_open, count, items, empty_state }` (auto-opens the bottom panel if collapsed)
   - `orders` → same shape
   - `ready_to_trade` → true iff panel_open AND zero positions AND zero orders
2. **`draw_position`** — one more round-trip to draw the native Long/Short box with entry/SL/TP.

Do NOT fall back to the slow multi-call path (chart_get_state + quote_get + data_get_ohlcv + data_get_study_values + trading_get_positions + trading_get_orders) for scalping. That path is for deep research, not for executing a trade in real time.

**Behavioral rules when reading `trade_snapshot`**:
- If `positions.panel_open` is false → tell the user you couldn't read the Account Manager and ask them to open it. DO NOT propose a trade.
- If `positions.count > 0` → the user already has an open position. Report the row(s) from `positions.items` and ask whether the new trade should replace, add, or be cancelled. DO NOT silently stack a new trade on top.
- If `orders.count > 0` → there are pending orders. Same rule: report and ask.
- If `ready_to_trade` is true → proceed straight to `draw_position`. Do not re-confirm with extra tool calls.

### Minimum Risk:Reward — HARD RULE: **1:2 or bigger**
**`draw_position` rejects any setup with R:R < 2 by default.** This is a project-level rule, enforced in code (`DEFAULT_MIN_RR = 2`). If the tool throws with `INVALID_INPUT` and a message like `Risk/reward 1.5 is below the minimum 2`, DO NOT pass `min_rr: 1` to bypass it — re-plan the trade with a tighter SL, a wider TP, or skip the setup entirely. Only override `min_rr` with explicit user authorization for the specific trade.

### "Draw a trade setup (long/short position)" — USE draw_position, NOT LINES
**NEVER draw trade setups with `horizontal_line`, `rectangle`, or `trend_line`** — those produce ugly, inconsistent visuals and force the user to do the mental math. The native Risk/Reward Long/Short tool in TradingView shows entry, TP (green box), SL (red box), qty, R:R ratio, $ amount target and $ amount stop automatically.

- `draw_position` → Long or Short Risk/Reward position in ONE call. Pass `entry`, `sl`, `tp` (direction is auto-detected: long when sl<entry<tp, short when sl>entry>tp). Tick size is read automatically from the symbol so it works for crypto, futures, forex and stocks. R:R gate enforced at `min_rr = 2`.
  - Example long: `draw_position({ entry: 70774, sl: 70690, tp: 70950 })` → R:R 2.1, accepted.
  - Example rejected: `draw_position({ entry: 70774, sl: 70700, tp: 70850 })` → R:R 1.03, THROWS. Re-plan.
  - Do NOT create the shape and then fix stopLevel/profitLevel afterwards — the tool already does it atomically.

### "What positions / orders do I have right now?"
Prefer `trade_snapshot` over these when you also need quote/bars — it's one round-trip instead of three.
- `trading_get_positions` → reads the Account Manager positions table. **Auto-opens the bottom panel if it's collapsed** (single-round-trip with polling). Returns `panel_open`, `position_count`, `positions[]`, `columns[]`, `empty_state_text`, and a `warning: 'panel_closed'` field if it could not read. Check `empty_state_text` to distinguish "no positions" (readable, empty) from "could not read".
- `trading_get_orders` → same contract for pending orders.
- These are READ-ONLY. Execution of any trade must be done by the user directly.

### "Draw other shapes on the chart" (NOT for trade setups)
- `draw_shape` → horizontal_line, trend_line, rectangle, text (pass point + optional point2). Use for marking levels/zones that are NOT part of a trade proposal.
- `draw_list` → see what's drawn
- `draw_remove_one` → remove by ID
- `draw_clear` → remove all

### "Manage alerts"
- `alert_create` → set price alert (condition: "crossing", "greater_than", "less_than")
- `alert_list` → view active alerts
- `alert_delete` → remove alerts

### "Navigate the UI"
- `ui_open_panel` → open/close pine-editor, strategy-tester, watchlist, alerts, trading
- `ui_click` → click buttons by aria-label, text, or data-name
- `layout_switch` → load a saved layout by name
- `ui_fullscreen` → toggle fullscreen
- `capture_screenshot` → take a screenshot (regions: "full", "chart", "strategy_tester")

### "TradingView isn't running"
- `tv_launch` → auto-detect and launch TradingView with CDP on Mac/Win/Linux
- `tv_health_check` → verify connection is working

## Context Management Rules

These tools can return large payloads. Follow these rules to avoid context bloat:

1. **Always use `summary: true` on `data_get_ohlcv`** unless you specifically need individual bars
2. **Always use `study_filter`** on pine tools when you know which indicator you want — don't scan all studies unnecessarily
3. **Never use `verbose: true`** on pine tools unless the user specifically asks for raw drawing data with IDs/colors
4. **Avoid calling `pine_get_source`** on complex scripts — it can return 200KB+. Only read if you need to edit the code.
5. **Avoid calling `data_get_indicator`** on protected/encrypted indicators — their inputs are encoded blobs. Use `data_get_study_values` instead for current values.
6. **Use `capture_screenshot`** for visual context instead of pulling large datasets — a screenshot is ~300KB but gives you the full visual picture
7. **Call `chart_get_state` once** at the start to get entity IDs, then reference them — don't re-call repeatedly
8. **Cap your OHLCV requests** — `count: 20` for quick analysis, `count: 100` for deeper work, `count: 500` only when specifically needed

### Output Size Estimates (compact mode)
| Tool | Typical Output |
|------|---------------|
| `quote_get` | ~200 bytes |
| `data_get_study_values` | ~500 bytes (all indicators) |
| `data_get_pine_lines` | ~1-3 KB per study (deduplicated levels) |
| `data_get_pine_labels` | ~2-5 KB per study (capped at 50) |
| `data_get_pine_tables` | ~1-4 KB per study (formatted rows) |
| `data_get_pine_boxes` | ~1-2 KB per study (deduplicated zones) |
| `data_get_ohlcv` (summary) | ~500 bytes |
| `data_get_ohlcv` (100 bars) | ~8 KB |
| `capture_screenshot` | ~300 bytes (returns file path, not image data) |

## Tool Conventions

- All tools return `{ success: true/false, ... }`
- Entity IDs (from `chart_get_state`) are session-specific — don't cache across sessions
- Pine indicators must be **visible** on chart for pine graphics tools to read their data
- `chart_manage_indicator` requires **full indicator names**: "Relative Strength Index" not "RSI", "Moving Average Exponential" not "EMA", "Bollinger Bands" not "BB"
- Screenshots save to `screenshots/` directory with timestamps
- OHLCV capped at 500 bars, trades at 20 per request
- Pine labels capped at 50 per study by default (pass `max_labels` to override)

## Architecture

```
Claude Code ←→ MCP Server (stdio) ←→ CDP (localhost:9222) ←→ TradingView Desktop (Electron)
```

Pine graphics path: `study._graphics._primitivesCollection.dwglines.get('lines').get(false)._primitivesDataById`
