/**
 * Error taxonomy for TradingView MCP.
 *
 * All internal errors should carry a code so Claude can reason about
 * what failed and decide how to react (retry, fallback, or give up).
 */

export const ErrorCodes = {
  // Connection / CDP
  TV_NOT_RUNNING: 'TV_NOT_RUNNING',
  CDP_DISCONNECTED: 'CDP_DISCONNECTED',
  CDP_TIMEOUT: 'CDP_TIMEOUT',
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',

  // Chart state
  CHART_NOT_READY: 'CHART_NOT_READY',
  SYMBOL_MISMATCH: 'SYMBOL_MISMATCH',
  API_NOT_AVAILABLE: 'API_NOT_AVAILABLE',

  // Waiters / timing
  TIMEOUT_WAITING_FOR_CHART: 'TIMEOUT_WAITING_FOR_CHART',
  TIMEOUT_WAITING_FOR_STUDY: 'TIMEOUT_WAITING_FOR_STUDY',
  TIMEOUT_WAITING_FOR_ELEMENT: 'TIMEOUT_WAITING_FOR_ELEMENT',
  TIMEOUT_WAITING_FOR_CONDITION: 'TIMEOUT_WAITING_FOR_CONDITION',

  // Selectors / UI
  SELECTOR_NOT_FOUND: 'SELECTOR_NOT_FOUND',
  ELEMENT_NOT_CLICKABLE: 'ELEMENT_NOT_CLICKABLE',

  // Data / parsing
  UNEXPECTED_API_SHAPE: 'UNEXPECTED_API_SHAPE',
  INVALID_INPUT: 'INVALID_INPUT',
  PARSE_ERROR: 'PARSE_ERROR',

  // Pine Script
  PINE_COMPILE_ERROR: 'PINE_COMPILE_ERROR',
  PINE_EDITOR_CLOSED: 'PINE_EDITOR_CLOSED',

  // Generic
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

/**
 * Structured error with a code for programmatic handling.
 */
export class TvMcpError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TvMcpError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      details: this.details,
    };
  }
}

/**
 * Wraps a potentially unknown error, preserving the code if it's already
 * a TvMcpError.
 */
export function wrapError(err, defaultCode = ErrorCodes.UNKNOWN_ERROR, context = {}) {
  if (err instanceof TvMcpError) return err;
  const message = err?.message || String(err);
  return new TvMcpError(defaultCode, message, { ...context, original: err?.stack });
}

/**
 * Accumulator for non-fatal errors — lets operations return partial
 * data along with a list of things that went wrong, instead of either
 * silently swallowing or failing completely.
 */
export class ErrorCollector {
  constructor() {
    this.errors = [];
  }

  add(field, code, message, details = {}) {
    this.errors.push({ field, code, message, ...details });
  }

  addFromCatch(field, code, err) {
    this.add(field, code, err?.message || String(err));
  }

  hasErrors() {
    return this.errors.length > 0;
  }

  toArray() {
    return this.errors.slice();
  }
}
