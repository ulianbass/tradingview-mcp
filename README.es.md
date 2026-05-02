# TradingView MCP

[English](README.md) · [Release v1.0.2](https://github.com/ulianbass/tradingview-mcp/releases/tag/v1.0.2) · [Historial del repo](docs/BRANCHES.md)

> Puente MCP local para TradingView Desktop: automatizacion de charts, flujos Pine, soporte Codex y acciones de trading con consentimiento explicito.

Este repositorio queda organizado con el mismo patron de Kerebrom: las lineas estables viven en `versions/vN/`, y la raiz queda como pagina principal y guia operativa del producto.

## Linea estable actual

| Linea | Estado | Raiz del producto | Proposito |
|---|---:|---|---|
| `v1` | actual | `versions/v1/` | Puente MCP para TradingView Desktop, 100+ tools, pruebas separadas offline/remotas/live, launcher endurecido. |

## Instalacion

```bash
git clone https://github.com/ulianbass/tradingview-mcp.git
cd tradingview-mcp/versions/v1
npm install
```

Usa este path del servidor MCP en clientes de IA:

```text
/ruta/absoluta/a/tradingview-mcp/versions/v1/src/server.js
```

En esta maquina, el path actual es:

```text
/Users/ulianbass/Documents/TradingView MCP/versions/v1/src/server.js
```

## Trabajar con el repo

Desde la raiz del repositorio:

```bash
npm test
npm run test:remote
npm run test:e2e
```

Esos comandos delegan a `versions/v1`.

Para trabajar directo dentro de la linea:

```bash
cd versions/v1
npm test
npm run test:remote
```

`npm run test:e2e` requiere TradingView Desktop corriendo con Chrome DevTools Protocol activo en el puerto `9222`.

## Politica de ramas

- Rama activa: `v1`.
- Rama default en GitHub: `v1`.
- `main` no se usa en este fork.
- Las referencias historicas o upstream deben quedar como tags o remotos externos solo cuando hagan falta; no deben aparecer como ramas activas del producto.

Ver [docs/BRANCHES.md](docs/BRANCHES.md).

## Docs de version

- [README v1](versions/v1/README.md)
- [README v1 en espanol](versions/v1/README.es.md)
- [Guia setup v1](versions/v1/SETUP_GUIDE.md)
- [Notas seguridad v1](versions/v1/SECURITY.md)

## Licencia

Software propietario con codigo visible. Ver [LICENSE](LICENSE).
