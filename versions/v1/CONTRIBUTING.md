# Contributing

Thanks for your interest in contributing to tradingview-mcp.

## Scope

This tool is a **local bridge** between Claude Code and the TradingView Desktop app running on your machine. All contributions must stay within this scope.

### What's in scope

- Improving reliability of existing tools (better selectors, error handling, timeouts)
- Adding CLI commands that mirror existing MCP tool capabilities
- Bug fixes and test coverage
- Documentation improvements
- Pine Script development workflow enhancements
- UI automation for the locally running Desktop app

### What's out of scope

Contributions **must not** add features that:

- **Connect directly to TradingView's servers for chart/market data** — market data access must go through the locally running Desktop app via CDP. Pine server helpers are acceptable only for explicit Pine compile/save workflows.
- **Bypass authentication or subscription restrictions** — this tool requires a valid TradingView account and subscription
- **Scrape, cache, or redistribute market data** — no data storage, no databases, no export-to-CSV of price data
- **Enable ungated automated trading** — this is not a trading bot framework. Order tools must stay explicit, consent-gated, and broker-mode aware.
- **Reverse-engineer or redistribute TradingView's proprietary code** — no bundled TradingView source, no charting library code
- **Access other users' data** — private scripts, watchlists, or account information of others

If you're unsure whether a feature fits, open an issue to discuss before submitting a PR.

## Development

```bash
npm install
npm test          # offline tests (no TradingView/CDP needed)
npm run test:remote # Pine compiler tests over the network
npm run test:e2e # live TradingView Desktop tests over CDP
tv status         # verify CDP connection (TradingView must be running)
```

## Pull Requests

- Keep changes focused — one feature or fix per PR
- Add tests for new functionality where possible
- Ensure `npm test` passes
- Run `npm run test:remote` when touching Pine compile/check behavior
- Run `npm run test:e2e` when touching CDP, selectors, UI automation, chart, drawing, or trading-panel behavior
- Test against a live TradingView Desktop instance before submitting
