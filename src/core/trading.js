/**
 * Read-only trading panel scraping.
 *
 * IMPORTANT: This module is READ-ONLY. It intentionally does NOT expose
 * any tools to submit, modify, or cancel orders, or to move money.
 * Claude policy is that trade execution must be done by the user directly.
 *
 * This lets Claude see what positions/orders exist so it can reason
 * about the user's current state without acting on their behalf.
 *
 * Behavior notes:
 *   - The Account Manager panel at the bottom of TradingView is scraped
 *     via DOM selectors. The tables only exist in the DOM while the
 *     panel is expanded, so these functions will AUTO-EXPAND the panel
 *     by clicking its toggle button before scraping, then leave it open.
 *   - If the panel cannot be opened, the result contains
 *     `warning: 'panel_closed'` so callers don't confuse "no positions"
 *     with "couldn't read positions".
 *   - Empty state is detected explicitly (the "Aún no hay posiciones
 *     abiertas" row) so callers know the panel was readable AND empty.
 */
import { evaluate } from '../connection.js';
import { Selectors } from '../selectors.js';
import { sleep } from '../await.js';

/**
 * Ensure the bottom Account Manager panel is expanded so the
 * positions/orders tables are present in the DOM.
 *
 * Returns { opened, already_open, toggle_found }.
 */
export async function ensureAccountManagerOpen() {
  // Single-round-trip version: detect state, click toggle if needed, and
  // poll for the tables table to appear — all in ONE evaluate. Previously
  // this took 3 CDP round-trips + a hard 400ms sleep (~550ms total);
  // now it's 1 round-trip with busy-wait and exits as soon as the table
  // mounts (~50-150ms in practice).
  const rootSelectors = JSON.stringify(Selectors.accountManagerRoot);
  const toggleSelectors = JSON.stringify(Selectors.accountManagerToggleButton);
  const tableSelectors = JSON.stringify(Selectors.tradingPositionsTable);

  const result = await evaluate(`
    (function() {
      var rs = ${rootSelectors};
      var ts = ${toggleSelectors};
      var tbl = ${tableSelectors};

      function findRoot() {
        for (var i = 0; i < rs.length; i++) {
          var el = document.querySelector(rs[i]);
          if (el) return el;
        }
        return null;
      }
      function isVisible(el) {
        return !!(el && el.offsetParent !== null && el.clientHeight > 10);
      }
      function findTable() {
        for (var i = 0; i < tbl.length; i++) {
          var el = document.querySelector(tbl[i]);
          if (el) return el;
        }
        return null;
      }

      var root = findRoot();
      if (isVisible(root) && findTable()) {
        return { opened: false, already_open: true, toggle_found: true, waited_ms: 0 };
      }

      // Click the toggle button
      var btn = null;
      for (var i = 0; i < ts.length; i++) {
        btn = document.querySelector(ts[i]);
        if (btn) break;
      }
      if (!btn) {
        var all = document.querySelectorAll('button');
        for (var j = 0; j < all.length; j++) {
          var txt = (all[j].textContent || '').trim();
          var aria = all[j].getAttribute('aria-label') || '';
          if (/paper trading|real trading/i.test(txt) && /(ccount Manager|estor de cuentas)/i.test(aria)) {
            btn = all[j];
            break;
          }
        }
      }
      if (!btn) return { opened: false, already_open: false, toggle_found: false, waited_ms: 0 };
      btn.click();

      // Busy-wait up to 500ms, checking every 25ms. Exits as soon as the
      // table actually mounts — usually ~50-100ms.
      var start = Date.now();
      var deadline = start + 500;
      while (Date.now() < deadline) {
        if (findTable()) {
          return { opened: true, already_open: false, toggle_found: true, waited_ms: Date.now() - start };
        }
        // Busy-wait: tight loop ~25ms
        var waitUntil = Date.now() + 25;
        while (Date.now() < waitUntil) { /* spin */ }
      }
      return { opened: false, already_open: false, toggle_found: true, waited_ms: Date.now() - start, timeout: true };
    })()
  `);

  return result || { opened: false, already_open: false, toggle_found: false };
}

/**
 * Shared scraping logic for positions / orders tables.
 *
 * @param {string[]} tableSelectors  Ordered list of selectors to find the table.
 * @param {string}   kind            'positions' | 'orders' (for the warning text).
 */
async function scrapeTable(tableSelectors, kind) {
  // Try to open the Account Manager first — the tables do not exist in the
  // DOM until the panel is expanded.
  const openState = await ensureAccountManagerOpen();

  const selectorsJson = JSON.stringify(tableSelectors);
  const emptySelectorsJson = JSON.stringify(Selectors.tradingEmptyStateRow);

  const data = await evaluate(`
    (function() {
      var selectors = ${selectorsJson};
      var emptySelectors = ${emptySelectorsJson};
      var table = null;
      for (var i = 0; i < selectors.length; i++) {
        table = document.querySelector(selectors[i]);
        if (table) break;
      }
      if (!table) return { panel_open: false, positions: [] };

      // Detect "no positions" empty state row inside this table scope.
      // Fall back to a document-wide search because the emptyStateRow is
      // rendered as a <tr> sibling inside the same table element.
      var emptyRow = null;
      for (var e = 0; e < emptySelectors.length; e++) {
        emptyRow = table.querySelector(emptySelectors[e]) || document.querySelector(emptySelectors[e]);
        if (emptyRow) break;
      }
      var emptyText = emptyRow ? (emptyRow.textContent || '').trim() : null;

      // Collect data-name of column headers to label cells downstream.
      var headerCells = table.querySelectorAll('[data-name$="-column"]');
      var columns = [];
      var seen = {};
      for (var h = 0; h < headerCells.length; h++) {
        var dn = headerCells[h].getAttribute('data-name') || '';
        var key = dn.replace(/-column$/, '');
        if (key && !seen[key]) { seen[key] = true; columns.push(key); }
      }

      // Rows that are actual data rows (not the header and not empty state)
      var rows = table.querySelectorAll('[class*="ka-tr"]:not([class*="thead"]):not([class*="emptyStateRow"])');
      var positions = [];
      var errors = [];
      for (var r = 0; r < rows.length; r++) {
        try {
          var cells = rows[r].querySelectorAll('[class*="ka-cell"], [class*="cell"], td');
          if (!cells.length) continue;
          var cellTexts = [];
          var labeled = {};
          for (var c = 0; c < cells.length; c++) {
            var txt = (cells[c].textContent || '').trim();
            cellTexts.push(txt);
            if (c < columns.length) labeled[columns[c]] = txt;
          }
          if (cellTexts.every(function(t) { return !t; })) continue;
          positions.push({ raw_cells: cellTexts, cells: labeled });
        } catch (ex) {
          errors.push({ row: r, message: ex.message });
        }
      }
      return {
        panel_open: true,
        position_count: positions.length,
        positions: positions,
        columns: columns,
        empty_state: emptyText,
        errors: errors,
      };
    })()
  `);

  const panelOpen = !!data?.panel_open;
  const result = {
    success: true,
    panel_open: panelOpen,
    position_count: data?.position_count || 0,
    positions: data?.positions || [],
    columns: data?.columns || [],
    empty_state_text: data?.empty_state || null,
    auto_opened: openState?.opened || false,
  };

  if (!panelOpen) {
    result.warning = 'panel_closed';
    result.help_message =
      'Could not find the Account Manager ' + kind + ' table in the DOM. ' +
      'The bottom trading panel is either closed OR this TradingView version ' +
      'uses a different selector. Open the "Paper trading" / "Opere" tab in ' +
      'the bottom bar and retry, or report the issue to update selectors.js.';
  }

  result.note =
    'Read-only. Execution of any trade must be done by the user directly. ' +
    'Before drawing or proposing a trade, always call this tool first and ' +
    'check `panel_open`, `position_count`, and `empty_state_text`.';

  if (data?.errors?.length) result.partial_errors = data.errors;
  return result;
}

/**
 * Read positions from the Trading Panel. Auto-expands the Account Manager
 * if it's collapsed. Returns an explicit warning when the panel can't be
 * read so callers don't confuse "no positions" with "couldn't read".
 */
export async function getPositions() {
  return scrapeTable(Selectors.tradingPositionsTable, 'positions');
}

/**
 * Read pending orders from the Trading Panel.
 */
export async function getOrders() {
  return scrapeTable(Selectors.tradingOrdersTable, 'orders');
}
