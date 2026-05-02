# TradingView MCP Repository Instructions For AI Agents

These instructions are for AI coding agents operating inside this repository.

## Product Defaults

- Current branch: `v1`.
- Current product root: `versions/v1`.
- MCP server entrypoint: `versions/v1/src/server.js`.
- CLI package root: `versions/v1`.
- TradingView connection: local Chrome DevTools Protocol on `localhost:9222`.

## If The User Asks You To Install TradingView MCP

Treat the task as an end-user product install, not a development task.

1. Use the current stable line:

```bash
cd versions/v1
```

2. Install dependencies:

```bash
npm install
```

3. Configure the AI client MCP server to run:

```bash
node /absolute/path/to/tradingview-mcp/versions/v1/src/server.js
```

4. Verify offline first:

```bash
npm test
```

5. Verify live only after TradingView Desktop has been launched with CDP enabled on port `9222`:

```bash
npm run test:e2e
```

## Safety Rules

- Do not submit, cancel, or close trades unless the user has explicitly authorized that specific action and the tool payload includes `consent: true`.
- Always check `trading_detect_mode` before using consent-gated execution tools.
- Never infer live-broker consent from paper-trading behavior, old messages, or general intent.
- Do not mix this `v1` implementation line with upstream branches unless the user asks for an upstream sync.
- Do not recreate `main` in this fork.
- Do not rewrite release tags without explicit user approval.

## If You Are Maintaining The Repo

- Root files are the product landing/ops surface.
- Implementation files live in `versions/v1`.
- Keep [README.md](README.md), [README.es.md](README.es.md), [CLAUDE.md](CLAUDE.md), and [docs/BRANCHES.md](docs/BRANCHES.md) aligned when version structure changes.
- Before committing, run at least:

```bash
npm test
npm run test:remote
git diff --check
```

For live TradingView changes, also run:

```bash
npm run test:e2e
```

only after CDP is actually available.
