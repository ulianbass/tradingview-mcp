/**
 * Trade execution — gated by explicit user consent.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  CONSENT MODEL                                                    │
 * │                                                                   │
 * │  Every function in this module REQUIRES `consent === true` as an  │
 * │  argument. Without it, the function throws before touching CDP.   │
 * │                                                                   │
 * │  This is a deliberate architectural choice — it makes it          │
 * │  impossible to accidentally trigger an order from an AI tool, a   │
 * │  script, or a chained tool call without the caller explicitly     │
 * │  stating "yes, I know this places/cancels/closes a real order".   │
 * │                                                                   │
 * │  The same consent gate applies to paper trading and live broker   │
 * │  trading. The function reports which mode is active in the result │
 * │  so downstream code can react accordingly.                        │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Implementation strategy:
 *   TradingView does not expose a programmatic broker API via its
 *   public chart widget. All execution goes through DOM automation of
 *   the Trading Panel + Order Dialog, using data-name attributes and
 *   keyboard shortcuts as fallbacks.
 */
import { evaluate, getClient } from '../connection.js';
import { sleep, waitForCondition } from '../await.js';
import { escapeJsString, validateNumber } from '../sanitize.js';
import { ErrorCodes } from '../errors.js';

/**
 * Refuses to proceed unless the caller has explicitly asserted consent.
 * Exported so tool wrappers can share the exact same gate.
 */
export function requireConsent(consent, operation) {
  if (consent !== true) {
    const err = new Error(
      `Explicit consent required to ${operation}. Pass { consent: true } to acknowledge this will affect real orders (or paper-trading simulated orders). This gate exists to prevent accidental execution by AI tools or scripts.`,
    );
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
}

/**
 * Detect whether the active Trading Panel is paper trading or a real
 * broker. Returns one of: "paper", "broker", "unknown", "not_connected".
 *
 * TradingView exposes this in the header of the trading panel — the
 * broker name text. "Paper Trading" or localized equivalent indicates
 * simulation mode.
 */
export async function detectTradingMode() {
  const mode = await evaluate(`
    (function() {
      try {
        var panel = document.querySelector('[data-name="trading-panel"]')
          || document.querySelector('[class*="trading-panel"]')
          || document.querySelector('[class*="tradingPanel"]');
        if (!panel) {
          var bottomArea = document.querySelector('[class*="layout__area--bottom"]');
          if (bottomArea) {
            var tabs = bottomArea.querySelectorAll('[role="tab"], [data-name*="tab"]');
            for (var t = 0; t < tabs.length; t++) {
              var txt = (tabs[t].textContent || '').toLowerCase();
              if (/paper|demo|simulation|simulaci/.test(txt)) return { mode: 'paper', source: 'tab_text' };
              if (/broker|live|real/.test(txt) && !/paper/.test(txt)) return { mode: 'broker', source: 'tab_text' };
            }
          }
          return { mode: 'not_connected', source: 'panel_not_found' };
        }
        var header = panel.querySelector('[class*="header"], [class*="broker-name"], [data-name*="broker"]');
        var headerText = header ? (header.textContent || '').toLowerCase() : '';
        if (/paper|demo|simulation|simulaci/.test(headerText)) return { mode: 'paper', source: 'header', text: headerText.substring(0, 60) };
        if (/connect|conectar/.test(headerText)) return { mode: 'not_connected', source: 'header', text: headerText.substring(0, 60) };
        if (headerText) return { mode: 'broker', source: 'header', text: headerText.substring(0, 60) };
        return { mode: 'unknown', source: 'empty_header' };
      } catch(e) { return { mode: 'unknown', source: 'error', error: e.message }; }
    })()
  `);
  return mode || { mode: 'unknown', source: 'evaluate_null' };
}

/**
 * Make sure the Trading Panel is open. Returns true if it's open after
 * this call, false if we couldn't open it.
 */
async function ensureTradingPanelOpen() {
  const isOpen = await evaluate(`
    (function() {
      var bottom = document.querySelector('[class*="layout__area--bottom"]');
      if (!bottom) return false;
      if (bottom.offsetHeight < 100) return false;
      var tp = document.querySelector('[data-name="trading-panel"]')
        || document.querySelector('[class*="trading-panel"]');
      return !!(tp && tp.offsetHeight > 50);
    })()
  `);
  if (isOpen) return true;

  // Click the trading panel tab or button
  await evaluate(`
    (function() {
      var btn = document.querySelector('[data-name="trading-button"]')
        || document.querySelector('[aria-label*="Trading"]')
        || document.querySelector('[data-name="tab-trading"]');
      if (btn) btn.click();
    })()
  `);

  const waited = await waitForCondition(
    async () => {
      return evaluate(`
        (function() {
          var tp = document.querySelector('[data-name="trading-panel"]')
            || document.querySelector('[class*="trading-panel"]');
          return !!(tp && tp.offsetHeight > 50);
        })()
      `);
    },
    { timeout: 3000, pollMin: 150, pollMax: 400, label: 'tradingPanel' },
  );
  return waited.ok;
}

/**
 * Open the Order Dialog — the full form with quantity, limit/stop price,
 * take profit, stop loss, etc. This is safer than the one-click
 * buy/sell buttons because nothing is submitted until we fill and click
 * "Place Order".
 *
 * Tries in order:
 *   1. Shift+T keyboard shortcut (TradingView's default for Order Dialog)
 *   2. Click the buy/sell-order-button which opens the dialog
 */
async function openOrderDialog({ side }) {
  // Strategy 1: keyboard shortcut (doesn't work on all builds, but try first)
  const client = await getClient();
  try {
    await client.Input.dispatchKeyEvent({ type: 'keyDown', modifiers: 8, key: 'T', code: 'KeyT', windowsVirtualKeyCode: 84 });
    await client.Input.dispatchKeyEvent({ type: 'keyUp', modifiers: 8, key: 'T', code: 'KeyT' });
  } catch {}

  const dialogOpened = await waitForCondition(
    async () => {
      return evaluate(`
        (function() {
          var d = document.querySelector('[data-name="order-dialog"]')
            || document.querySelector('[data-dialog-name*="order"]')
            || document.querySelector('[class*="orderDialog"]');
          return !!(d && d.offsetParent !== null);
        })()
      `);
    },
    { timeout: 1200, pollMin: 100, pollMax: 300 },
  );
  if (dialogOpened.ok) return { method: 'keyboard' };

  // Strategy 2: click the buy/sell order button — these open a confirm
  // dialog in most broker integrations.
  const sideButton = side === 'buy' ? 'buy-order-button' : 'sell-order-button';
  const clicked = await evaluate(`
    (function() {
      var btn = document.querySelector('[data-name="${sideButton}"]');
      if (!btn) return false;
      btn.click();
      return true;
    })()
  `);
  if (!clicked) {
    const err = new Error(`Could not find ${sideButton} — is the Trading Panel open?`);
    err.code = ErrorCodes.SELECTOR_NOT_FOUND;
    throw err;
  }

  const dialogOpened2 = await waitForCondition(
    async () => {
      return evaluate(`
        (function() {
          var d = document.querySelector('[data-name="order-dialog"]')
            || document.querySelector('[data-dialog-name*="order"]')
            || document.querySelector('[class*="orderDialog"]');
          return !!(d && d.offsetParent !== null);
        })()
      `);
    },
    { timeout: 2500, pollMin: 150, pollMax: 400 },
  );
  if (!dialogOpened2.ok) {
    const err = new Error('Order Dialog did not appear after clicking the order button.');
    err.code = ErrorCodes.TIMEOUT_WAITING_FOR_ELEMENT;
    throw err;
  }
  return { method: 'click' };
}

/**
 * Find and set the value of a numeric input inside the Order Dialog by
 * matching its label or placeholder. Uses React's native setter so the
 * framework picks up the change.
 */
async function setDialogField(fieldPattern, value) {
  const pattern = escapeJsString(fieldPattern);
  const val = validateNumber(value, fieldPattern);
  return evaluate(`
    (function() {
      try {
        var dialog = document.querySelector('[data-name="order-dialog"]')
          || document.querySelector('[class*="orderDialog"]');
        if (!dialog) return { ok: false, error: 'dialog not open' };
        var inputs = dialog.querySelectorAll('input');
        var pattern = new RegExp('${pattern}', 'i');
        for (var i = 0; i < inputs.length; i++) {
          var inp = inputs[i];
          var labels = [
            inp.name || '',
            inp.placeholder || '',
            inp.getAttribute('aria-label') || '',
            inp.getAttribute('data-name') || '',
          ];
          var parent = inp.closest('[class*="row"], [class*="field"], label');
          if (parent) {
            var lbl = parent.querySelector('[class*="label"], label');
            if (lbl) labels.push(lbl.textContent || '');
          }
          var matched = labels.some(function(l) { return pattern.test(l); });
          if (matched) {
            var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(inp, String(${val}));
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true, field: labels.find(function(l) { return l; }) || 'unknown' };
          }
        }
        return { ok: false, error: 'field not found', tried: inputs.length };
      } catch(e) { return { ok: false, error: e.message }; }
    })()
  `);
}

/**
 * Submit the Order Dialog by clicking "Place Order" / "Create" / "Buy"
 * / "Sell" (the exact text varies by broker and language).
 */
async function submitOrderDialog() {
  return evaluate(`
    (function() {
      try {
        var dialog = document.querySelector('[data-name="order-dialog"]')
          || document.querySelector('[class*="orderDialog"]');
        if (!dialog) return { ok: false, error: 'dialog not open' };
        var btns = dialog.querySelectorAll('button[data-name="submit"], button[type="submit"], button');
        var submitKeywords = /^(place|create|buy|sell|submit|comprar|vender|crear|enviar)/i;
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i];
          var txt = (b.textContent || '').trim();
          var dn = (b.getAttribute('data-name') || '');
          if (dn === 'submit' || submitKeywords.test(txt)) {
            if (b.disabled) return { ok: false, error: 'submit button disabled', text: txt };
            b.click();
            return { ok: true, clicked_text: txt.substring(0, 40) };
          }
        }
        return { ok: false, error: 'submit button not found' };
      } catch(e) { return { ok: false, error: e.message }; }
    })()
  `);
}

/**
 * Submit an order — market, limit, or stop — with take profit and
 * stop loss if provided.
 *
 * REQUIRES CONSENT. Throws if consent !== true.
 *
 * @param {object} opts
 * @param {boolean} opts.consent         MUST be exactly `true`
 * @param {string}  opts.side            "buy" or "sell"
 * @param {string}  opts.order_type      "market" | "limit" | "stop"
 * @param {number}  opts.quantity        position size in contracts/units
 * @param {number}  [opts.limit_price]   required for limit orders
 * @param {number}  [opts.stop_price]    required for stop orders
 * @param {number}  [opts.take_profit]   optional TP price
 * @param {number}  [opts.stop_loss]     optional SL price
 */
export async function submitOrder(opts = {}) {
  const {
    consent,
    side,
    order_type,
    quantity,
    limit_price,
    stop_price,
    take_profit,
    stop_loss,
  } = opts;

  requireConsent(consent, 'submit an order');

  // Validate inputs up front
  if (side !== 'buy' && side !== 'sell') {
    const err = new Error('side must be "buy" or "sell"');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  if (!['market', 'limit', 'stop'].includes(order_type)) {
    const err = new Error('order_type must be "market", "limit", or "stop"');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  const qty = validateNumber(quantity, 'quantity');
  if (qty <= 0) {
    const err = new Error('quantity must be positive');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  if (order_type === 'limit' && limit_price == null) {
    const err = new Error('limit_price is required for limit orders');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  if (order_type === 'stop' && stop_price == null) {
    const err = new Error('stop_price is required for stop orders');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }

  const mode = await detectTradingMode();
  if (mode.mode === 'not_connected') {
    const err = new Error(
      'Trading Panel is not connected. Open the Trading Panel and log into a broker (or select Paper Trading) before submitting orders.',
    );
    err.code = ErrorCodes.API_NOT_AVAILABLE;
    err.details = { detected_mode: mode };
    throw err;
  }

  const panelOpen = await ensureTradingPanelOpen();
  if (!panelOpen) {
    const err = new Error('Could not open the Trading Panel.');
    err.code = ErrorCodes.TIMEOUT_WAITING_FOR_ELEMENT;
    throw err;
  }

  const opened = await openOrderDialog({ side });

  // Fill the fields. Each setDialogField returns { ok, field? } or
  // { ok: false, error }. We collect errors and report them instead of
  // bailing on the first failure, because different brokers label
  // their fields differently.
  const fillResults = {};
  fillResults.quantity = await setDialogField('qty|quantity|cantidad', qty);

  if (order_type === 'limit') {
    fillResults.limit_price = await setDialogField('price|precio', validateNumber(limit_price, 'limit_price'));
  }
  if (order_type === 'stop') {
    fillResults.stop_price = await setDialogField('stop|trigger|disparo', validateNumber(stop_price, 'stop_price'));
  }
  if (take_profit != null) {
    fillResults.take_profit = await setDialogField('take profit|tp|ganancia', validateNumber(take_profit, 'take_profit'));
  }
  if (stop_loss != null) {
    fillResults.stop_loss = await setDialogField('stop loss|sl|p[eé]rdida', validateNumber(stop_loss, 'stop_loss'));
  }

  // Short grace period for the dialog to update the submit-button enabled state
  await sleep(300);

  const submitted = await submitOrderDialog();
  if (!submitted?.ok) {
    const err = new Error(`Failed to submit order: ${submitted?.error || 'unknown'}`);
    err.code = ErrorCodes.ELEMENT_NOT_CLICKABLE;
    err.details = { fill_results: fillResults, submit: submitted };
    throw err;
  }

  return {
    success: true,
    mode: mode.mode,
    mode_source: mode.source,
    side,
    order_type,
    quantity: qty,
    limit_price: limit_price ?? null,
    stop_price: stop_price ?? null,
    take_profit: take_profit ?? null,
    stop_loss: stop_loss ?? null,
    dialog_method: opened.method,
    fill_results: fillResults,
    submit: submitted,
    note:
      mode.mode === 'paper'
        ? 'Paper trading order submitted. No real money at risk.'
        : mode.mode === 'broker'
          ? 'LIVE broker order submitted. Real money at risk.'
          : 'Order submitted. Trading mode could not be confirmed — verify in the Trading Panel.',
  };
}

/**
 * Cancel a pending order by its visible ID in the Orders tab of the
 * Trading Panel. REQUIRES CONSENT.
 */
export async function cancelOrder({ consent, order_id } = {}) {
  requireConsent(consent, 'cancel an order');
  if (!order_id) {
    const err = new Error('order_id is required');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  const mode = await detectTradingMode();
  const escapedId = escapeJsString(order_id);
  const result = await evaluate(`
    (function() {
      try {
        var target = '${escapedId}';
        var rows = document.querySelectorAll('[data-name="orders"] [class*="row"], [class*="orders-list"] [class*="row"]');
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if ((row.textContent || '').indexOf(target) === -1) continue;
          var cancelBtn = row.querySelector('[data-name="cancel-order-button"], [aria-label*="Cancel"], [aria-label*="Cancelar"], button[class*="cancel"]');
          if (cancelBtn) { cancelBtn.click(); return { ok: true, clicked: true }; }
        }
        return { ok: false, error: 'order row not found or no cancel button' };
      } catch(e) { return { ok: false, error: e.message }; }
    })()
  `);
  if (!result?.ok) {
    const err = new Error(`Failed to cancel order: ${result?.error || 'unknown'}`);
    err.code = ErrorCodes.ELEMENT_NOT_CLICKABLE;
    err.details = result;
    throw err;
  }
  return { success: true, mode: mode.mode, order_id, ...result };
}

/**
 * Close an open position at market. REQUIRES CONSENT.
 */
export async function closePosition({ consent, position_id } = {}) {
  requireConsent(consent, 'close a position');
  if (!position_id) {
    const err = new Error('position_id is required');
    err.code = ErrorCodes.INVALID_INPUT;
    throw err;
  }
  const mode = await detectTradingMode();
  const escapedId = escapeJsString(position_id);
  const result = await evaluate(`
    (function() {
      try {
        var target = '${escapedId}';
        var rows = document.querySelectorAll('[data-name="positions"] [class*="row"], [class*="positions-list"] [class*="row"]');
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if ((row.textContent || '').indexOf(target) === -1) continue;
          var closeBtn = row.querySelector('[data-name="close-position-button"], [aria-label*="Close"], [aria-label*="Cerrar"], button[class*="close"]');
          if (closeBtn) { closeBtn.click(); return { ok: true, clicked: true }; }
        }
        return { ok: false, error: 'position row not found or no close button' };
      } catch(e) { return { ok: false, error: e.message }; }
    })()
  `);
  if (!result?.ok) {
    const err = new Error(`Failed to close position: ${result?.error || 'unknown'}`);
    err.code = ErrorCodes.ELEMENT_NOT_CLICKABLE;
    err.details = result;
    throw err;
  }
  return { success: true, mode: mode.mode, position_id, ...result };
}
