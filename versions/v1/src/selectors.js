/**
 * Central table of DOM selectors used across the codebase.
 *
 * Each entry is an ordered list of selectors, tried in order until one
 * resolves. The first (most specific, most stable) is preferred; the
 * later ones are fallbacks for when TradingView refactors its CSS.
 *
 * When TradingView updates and a selector breaks, UPDATE THIS FILE —
 * not the consumers. All core modules should import from here.
 *
 * Stability hierarchy (most to least):
 *   1. [data-name="..."]         — semantic, most stable across versions
 *   2. [aria-label="..."]        — a11y, also stable
 *   3. [class*="..."]            — fragile, breaks on every CSS refactor
 *   4. tag selectors (canvas, etc.) — last resort
 */

export const Selectors = {
  // ─── Panels / layout ───
  bottomPanel: [
    '[data-name="bottom-widgetbar"]',
    '[class*="layout__area--bottom"]',
    '[class*="bottom-widgetbar-content"]',
  ],
  rightPanel: [
    '[data-name="right-widgetbar"]',
    '[class*="layout__area--right"]',
  ],
  chartCanvas: [
    '[data-name="pane-canvas"]',
    '[class*="chart-container"] canvas',
    'canvas',
  ],

  // ─── Loading indicators ───
  loader: [
    '[data-name="loading"]',
    '[class*="loader"]',
    '[class*="loading"]',
  ],

  // ─── Symbol / header ───
  symbolTitle: [
    '[data-name="legend-source-title"]',
    '[class*="title"] [class*="apply-common-tooltip"]',
  ],

  // ─── Strategy Tester ───
  strategyTesterPanel: [
    '[data-name="backtesting"]',
    '[class*="strategyReport"]',
    '[class*="strategy-report"]',
  ],
  strategyReportItem: [
    '[class*="reportItem"]',
    '[class*="metric"]',
  ],

  // ─── Alerts ───
  alertButton: [
    '[aria-label="Create Alert"]',
    '[data-name="alerts"]',
  ],
  alertInputContainer: [
    '[data-name="create-alert-dialog"]',
    '[class*="alert-dialog"]',
    '[class*="alert"]',
  ],
  alertSubmitButton: [
    'button[data-name="submit"]',
  ],

  // ─── Pine Editor ───
  pineEditorMonaco: [
    '.monaco-editor.pine-editor-monaco',
    '[data-name="pine-editor"] .monaco-editor',
    '.monaco-editor',
  ],
  pineConsoleRow: [
    '[data-name="pine-editor-console"] [class*="row"]',
    '[class*="consoleRow"]',
    '[class*="console-row"]',
  ],
  pineConsoleLog: [
    '[data-name="pine-editor-console"] [class*="log"]',
    '[class*="consoleLog"]',
    '[class*="console-log"]',
  ],

  // ─── Header toolbar ───
  fullscreenButton: [
    '[data-name="header-toolbar-fullscreen"]',
    '[aria-label*="Fullscreen"]',
  ],

  // ─── Trading panel (Account Manager) ───
  accountManagerRoot: [
    '[class*="accountManager"]',
    '[class*="account-manager"]',
  ],
  // Button that opens/closes the bottom Account Manager panel. Note the
  // aria-label is localized — Spanish builds say "Gestor de cuentas",
  // English says "Account Manager". We match both.
  accountManagerToggleButton: [
    'button[aria-label="Open Account Manager"]',
    'button[aria-label="Abrir Gestor de cuentas"]',
    'button[aria-label*="ccount Manager"]',
    'button[aria-label*="estor de cuentas"]',
  ],
  accountManagerCloseButton: [
    'button[aria-label="Close Account Manager"]',
    'button[aria-label="Cerrar Gestor de cuentas"]',
  ],
  tradingPanelButton: [
    '[data-name="trading-button"]',
    '[aria-label="Trading Panel"]',
  ],
  // The data-name changed in recent TV versions to "<Broker>.positions-table".
  // For paper trading it's "Paper.positions-table", for real brokers it's
  // e.g. "Binance.positions-table", "IBKR.positions-table", etc.
  tradingPositionsTable: [
    '[data-name$=".positions-table"]',
    '[data-name="Paper.positions-table"]',
    '[data-name="positions"]',
    '[class*="positions-list"]',
  ],
  tradingOrdersTable: [
    '[data-name$=".orders-table"]',
    '[data-name="Paper.orders-table"]',
    '[data-name="orders"]',
    '[class*="orders-list"]',
  ],
  tradingEmptyStateRow: [
    '[class*="emptyStateRow"]',
    '[class*="empty-state"]',
  ],

  // ─── DOM / Depth ───
  domPanel: [
    '[data-name="dom"]',
    '[class*="depth"]',
    '[class*="orderBook"]',
    '[class*="dom-"]',
    '[class*="DOM"]',
  ],

  // ─── Watchlist ───
  watchlistButton: [
    '[data-name="base-watchlist-widget-button"]',
    '[aria-label="Watchlist"]',
  ],
};

/**
 * Build a JS expression that tries each selector in order and returns
 * the first matching element (or null). Use this inside evaluate() calls.
 *
 *   evaluate(`(${querySelectorFirstJS('loader')}).offsetParent !== null`)
 */
export function querySelectorFirstJS(key) {
  const list = Selectors[key];
  if (!list) throw new Error(`Unknown selector key: ${key}`);
  const jsonList = JSON.stringify(list);
  return `(function(){var sels=${jsonList};for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);if(el)return el;}return null;})()`;
}

/**
 * Build a JS expression that returns true if any of the selectors match.
 */
export function anySelectorExistsJS(key) {
  const list = Selectors[key];
  if (!list) throw new Error(`Unknown selector key: ${key}`);
  const jsonList = JSON.stringify(list);
  return `(function(){var sels=${jsonList};for(var i=0;i<sels.length;i++){if(document.querySelector(sels[i]))return true;}return false;})()`;
}

/**
 * Return the raw selector list for a key — use when you need to inline
 * the selectors into a larger JS expression.
 */
export function getSelectors(key) {
  const list = Selectors[key];
  if (!list) throw new Error(`Unknown selector key: ${key}`);
  return list.slice();
}
