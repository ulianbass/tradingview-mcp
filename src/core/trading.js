/**
 * Read-only trading panel scraping.
 *
 * IMPORTANT: This module is READ-ONLY. It intentionally does NOT expose
 * any tools to submit, modify, or cancel orders, or to move money.
 * Claude policy is that trade execution must be done by the user directly.
 *
 * This lets Claude see what positions/orders exist so it can reason
 * about the user's current state without acting on their behalf.
 */
import { evaluate } from '../connection.js';
import { Selectors } from '../selectors.js';
import { ErrorCollector, ErrorCodes } from '../errors.js';

/**
 * Read positions from the Trading Panel (if visible).
 * Returns empty array if panel is closed or no positions.
 */
export async function getPositions() {
  const selectorsJson = JSON.stringify(Selectors.tradingPositionsTable);
  const data = await evaluate(`
    (function() {
      var selectors = ${selectorsJson};
      var table = null;
      for (var i = 0; i < selectors.length; i++) {
        table = document.querySelector(selectors[i]);
        if (table) break;
      }
      if (!table) return { panel_open: false, positions: [] };
      var rows = table.querySelectorAll('[class*="row"], tr');
      var positions = [];
      var errors = [];
      for (var r = 0; r < rows.length; r++) {
        try {
          var cells = rows[r].querySelectorAll('[class*="cell"], td');
          if (cells.length < 2) continue;
          var cellTexts = [];
          for (var c = 0; c < cells.length; c++) {
            cellTexts.push((cells[c].textContent || '').trim());
          }
          if (cellTexts.every(function(t) { return !t; })) continue;
          positions.push({ raw_cells: cellTexts });
        } catch(e) {
          errors.push({ row: r, message: e.message });
        }
      }
      return { panel_open: true, position_count: positions.length, positions: positions, errors: errors };
    })()
  `);

  return {
    success: true,
    panel_open: data?.panel_open || false,
    position_count: data?.position_count || 0,
    positions: data?.positions || [],
    partial_errors: data?.errors?.length ? data.errors : undefined,
    note: 'Read-only. Positions are returned as raw cell text arrays. Use quote_get or chart_observe to verify price context. Execution of any trade must be done by the user directly.',
  };
}

/**
 * Read pending orders from the Trading Panel (if visible).
 */
export async function getOrders() {
  const selectorsJson = JSON.stringify(Selectors.tradingOrdersTable);
  const data = await evaluate(`
    (function() {
      var selectors = ${selectorsJson};
      var table = null;
      for (var i = 0; i < selectors.length; i++) {
        table = document.querySelector(selectors[i]);
        if (table) break;
      }
      if (!table) return { panel_open: false, orders: [] };
      var rows = table.querySelectorAll('[class*="row"], tr');
      var orders = [];
      var errors = [];
      for (var r = 0; r < rows.length; r++) {
        try {
          var cells = rows[r].querySelectorAll('[class*="cell"], td');
          if (cells.length < 2) continue;
          var cellTexts = [];
          for (var c = 0; c < cells.length; c++) {
            cellTexts.push((cells[c].textContent || '').trim());
          }
          if (cellTexts.every(function(t) { return !t; })) continue;
          orders.push({ raw_cells: cellTexts });
        } catch(e) {
          errors.push({ row: r, message: e.message });
        }
      }
      return { panel_open: true, order_count: orders.length, orders: orders, errors: errors };
    })()
  `);

  return {
    success: true,
    panel_open: data?.panel_open || false,
    order_count: data?.order_count || 0,
    orders: data?.orders || [],
    partial_errors: data?.errors?.length ? data.errors : undefined,
    note: 'Read-only. Use quote_get or chart_observe for price context. Execution of any trade must be done by the user directly.',
  };
}
