# TradingView MCP

[Español](README.es.md) · [Release v1.0.2](https://github.com/ulianbass/tradingview-mcp/releases/tag/v1.0.2) · [Repository history](docs/BRANCHES.md)

> Local TradingView Desktop MCP bridge for chart automation, Pine workflows, Codex support, and consent-gated trading actions.

This repository follows the same product-line layout used by Kerebrom: stable implementation lines live under `versions/vN/`, while the repository root stays as the product landing page and operational guide.

## Current Stable Line

| Line | Status | Product root | Purpose |
|---|---:|---|---|
| `v1` | current | `versions/v1/` | TradingView Desktop MCP bridge, 100+ tools, offline/remote/live test split, hardened launcher. |

## Install

```bash
git clone https://github.com/ulianbass/tradingview-mcp.git
cd tradingview-mcp/versions/v1
npm install
```

Use this MCP server path in AI clients:

```text
/absolute/path/to/tradingview-mcp/versions/v1/src/server.js
```

For this machine, the current path is:

```text
/Users/ulianbass/Documents/TradingView MCP/versions/v1/src/server.js
```

## Work With The Repo

From the repository root:

```bash
npm test
npm run test:remote
npm run test:e2e
```

Those commands delegate to `versions/v1`.

For direct version-line work:

```bash
cd versions/v1
npm test
npm run test:remote
```

`npm run test:e2e` requires TradingView Desktop running with Chrome DevTools Protocol enabled on port `9222`.

## Branch Policy

- Active branch: `v1`.
- Default GitHub branch: `v1`.
- `main` is not used in this fork.
- Historical or upstream references should be tags or external remotes only when intentionally needed; they should not appear as active product branches.

See [docs/BRANCHES.md](docs/BRANCHES.md).

## Version Docs

- [v1 README](versions/v1/README.md)
- [v1 Spanish README](versions/v1/README.es.md)
- [v1 setup guide](versions/v1/SETUP_GUIDE.md)
- [v1 security notes](versions/v1/SECURITY.md)

## License

Source-available proprietary software. See [LICENSE](LICENSE).
