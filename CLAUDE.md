# TradingView MCP — Claude Instructions

This repository uses a Kerebrom-style version layout.

## Product Defaults

- Current branch: `v1`.
- Current product root: `versions/v1`.
- MCP server entrypoint: `versions/v1/src/server.js`.
- Run development commands from the repository root or from `versions/v1`.

Root commands delegate to `versions/v1`:

```bash
npm test
npm run test:remote
npm run test:e2e
```

## Operating Rules

- Do not recreate or use `main` for this fork.
- Keep implementation work inside `versions/v1`.
- Treat `versions/v1/CLAUDE.md` as the detailed MCP tool decision tree.
- Keep root docs and version docs aligned when setup paths, branch policy, or release behavior changes.
- Do not submit, cancel, or close trades unless the user explicitly authorizes that specific action and the payload includes `consent: true`.
- Always verify live-broker mode with `trading_detect_mode` before any consent-gated execution tool.

## Verification

Use:

```bash
npm test
npm run test:remote
git diff --check
```

Use `npm run test:e2e` only when TradingView Desktop is running with CDP enabled on `localhost:9222`.
