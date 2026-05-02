# Repository History

TradingView MCP keeps active product work on version-named branches and under `versions/vN/`, matching the structure used in Proyecto Kerebrom.

## Timeline

| Order | Ref | Type | Purpose |
|---:|---|---|---|
| 1 | `v1.0.0` | tag/release | First polished TradingView MCP baseline for this fork. |
| 2 | `v1.0.1` | tag/release | Kerebrom-style repository layout with the active product under `versions/v1/`. |
| 3 | `v1.0.2` | tag/release | Live TradingView stability fixes: CDP config paths, replay stop recovery, resilient chart data, and sanitization tests. |
| 4 | `v1` | branch | Current active product line under `versions/v1/`. |

## Policy

- New stable work targets `v1`.
- `main` is not used in this fork.
- GitHub default branch is `v1`.
- Historical implementations should be preserved as release tags, not active branches.
- Upstream references should only be re-added intentionally when syncing from `tradesdontlie/tradingview-mcp`.
- The active implementation line lives under `versions/v1/`.

## Current Layout

```text
.
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── README.es.md
├── docs/
│   └── BRANCHES.md
└── versions/
    └── v1/
        ├── package.json
        ├── src/
        ├── tests/
        ├── scripts/
        ├── skills/
        └── README.md
```

## Verification Baseline

The current `v1.0.2` line was verified with:

```bash
npm test
npm run test:remote
npm run test:e2e
git diff --check
```

Live E2E verification requires TradingView Desktop with CDP on port `9222`.
