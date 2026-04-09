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
  const rootSelectors = JSON.stringify(Selectors.accountManagerRoot);
  const toggleSelectors = JSON.stringify(Selectors.accountManagerToggleButton);
  const closeSelectors = JSON.stringify(Selectors.accountManagerCloseButton);

  const state = await evaluate(`
    (function() {
      var rs = ${rootSelectors};
      var root = null;
      for (var i = 0; i < rs.length; i++) {
        root = document.querySelector(rs[i]);
        if (root) break;
      }
      if (!root) return { root_found: false };
      var h = root.clientHeight;
      var visible = root.offsetParent !== null && h > 10;
      return { root_found: true, height: h, visible: visible };
    })()
  `);

  if (state?.visible) {
    return { opened: false, already_open: true, toggle_found: true };
  }

  const toggled = await evaluate(`
    (function() {
      var ts = ${toggleSelectors};
      var cs = ${closeSelectors};
      // "Close" button appears when panel is open; we only want the "Open" one
      // but in some locales the toggle label flips between Open/Close, so we
      // try the open selectors first and fall through to any toggle that
      // matches account manager text.
      var btn = null;
      for (var i = 0; i < ts.length; i++) {
        btn = document.querySelector(ts[i]);
        if (btn) break;
      }
      if (!btn) {
        // Fallback: any button whose text is "Paper trading" and aria is
        // localized account manager toggle. Enumerate buttons.
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
      if (!btn) return { clicked: false, toggle_found: false };
      btn.click();
      return { clicked: true, toggle_found: true };
    })()
  `);

  if (!toggled?.clicked) {
    return { opened: false, already_open: false, toggle_found: false };
  }

  // Give TV time to mount the tables
  await sleep(400);

  const postState = await evaluate(`
    (function() {
      var rs = ${rootSelectors};
      var root = null;
      for (var i = 0; i < rs.length; i++) {
        root = document.querySelector(rs[i]);
        if (root) break;
      }
      if (!root) return { visible: false };
      return { visible: root.offsetParent !== null && root.clientHeight > 10 };
    })()
  `);

  return {
    opened: !!postState?.visible,
    already_open: false,
    toggle_found: true,
  };
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
