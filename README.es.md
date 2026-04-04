# TradingView MCP

Servidor MCP para TradingView Desktop — 78 herramientas para leer, controlar y automatizar charts via Chrome DevTools Protocol. Funciona con **Claude Code**, **Codex** y **Claude Desktop**.

Construido sobre [tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) de [@tradesdontlie](https://github.com/tradesdontlie) y el [fork de Jackson](https://github.com/LewisWJackson/tradingview-mcp-jackson) de [@LewisWJackson](https://github.com/LewisWJackson). Este fork agrega seguridad, sanitizacion de inputs, correccion de bugs, compatibilidad con Codex y mejoras de calidad de codigo.

> [!WARNING]
> **No afiliado con TradingView Inc. ni Anthropic.** Esta herramienta se conecta a tu app TradingView Desktop local via Chrome DevTools Protocol. Revisa el [Aviso legal](#aviso-legal) antes de usar.

> [!IMPORTANT]
> **Requiere suscripcion valida de TradingView.** Esta herramienta no evita ningun paywall. Lee y controla la app TradingView Desktop que ya esta corriendo en tu maquina.

> [!NOTE]
> **Todo el procesamiento es local.** Nada se envia a ningun lado. Ningun dato de TradingView sale de tu maquina.

---

## Que hay de nuevo en este fork

| Caracteristica | Que hace |
|----------------|----------|
| **Seguridad reforzada** | Sanitizacion de inputs via `escapeJsString()` / `validateNumber()` — corrige vulnerabilidades de inyeccion JS en 8 modulos core |
| **Correccion de bugs** | JSON.parse protegido, await faltantes, validacion de indices negativos, shutdown graceful |
| `morning_brief` | Un comando que escanea tu watchlist, lee tus indicadores y devuelve datos estructurados para generar tu sesgo de sesion |
| `session_save` / `session_get` | Guarda tu brief diario en `~/.tradingview-mcp/sessions/` para comparar hoy vs ayer |
| `rules.json` | Escribe tus reglas de trading una vez — criterios de sesgo, reglas de riesgo, watchlist. El morning brief las aplica automaticamente |
| **Soporte Codex** | Compatibilidad completa con Codex Desktop — configuracion automatica via `config.toml` con registro del servidor MCP |
| Fix de lanzamiento | Compatibilidad con TradingView Desktop v2.14+ |
| `tv brief` CLI | Corre tu morning brief desde la terminal en una palabra |

---

## Instalacion rapida

Pega esto en Claude Code y se encarga de todo:

```
Configura TradingView MCP para mi.
Clona https://github.com/ulianbass/tradingview-mcp.git en ~/tradingview-mcp, corre npm install, y agregalo a mi config MCP en ~/.claude/mcp.json (mezcla con servidores existentes, no los sobreescribas).
El bloque de config es: { "mcpServers": { "TradingView MCP": { "command": "node", "args": ["/Users/TU_USUARIO/tradingview-mcp/src/server.js"] } } } — reemplaza TU_USUARIO con mi usuario real.
Luego copia rules.example.json a rules.json y abrelo para que llene mis reglas de trading.
Finalmente reinicia y verifica con tv_health_check.
```

O sigue los pasos manuales:

---

## Requisitos

- **TradingView Desktop** (requiere suscripcion de pago para datos en tiempo real)
- **Node.js 18+**
- **Claude Code** (para tools MCP) o cualquier terminal (para CLI)
- **macOS, Windows o Linux**

---

## Inicio rapido

### 1. Clonar e instalar

```bash
git clone https://github.com/ulianbass/tradingview-mcp.git ~/tradingview-mcp
cd ~/tradingview-mcp
npm install
```

### 2. Configurar reglas

```bash
cp rules.example.json rules.json
```

Abre `rules.json` y llena:
- Tu **watchlist** (simbolos a escanear cada manana)
- Tus **criterios de sesgo** (que hace algo alcista/bajista/neutral para ti)
- Tus **reglas de riesgo** (las reglas que quieres que la IA verifique antes de cada sesion)

### 3. Lanzar TradingView con CDP

TradingView debe estar corriendo con el puerto de debug habilitado.

**Mac:**
```bash
./scripts/launch_tv_debug_mac.sh
```

**Windows:**
```bash
scripts\launch_tv_debug.bat
```

**Linux:**
```bash
./scripts/launch_tv_debug_linux.sh
```

O usa el tool MCP despues del setup: *"Usa tv_launch para iniciar TradingView en modo debug"*

### 4. Agregar a tus herramientas de IA

Funciona con **Claude Code**, **Claude Desktop** y **Codex**. Agrega al que uses:

#### Claude Code

Agrega a `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "TradingView MCP": {
      "command": "node",
      "args": ["/Users/TU_USUARIO/tradingview-mcp/src/server.js"]
    }
  }
}
```

#### Claude Desktop

Agrega a `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) dentro del objeto `mcpServers`:

```json
"TradingView MCP": {
  "command": "node",
  "args": ["/Users/TU_USUARIO/tradingview-mcp/src/server.js"]
}
```

#### Codex

Agrega a `~/.codex/config.toml`:

```toml
[mcp_servers.tradingview]
command = "node"
args = ["/Users/TU_USUARIO/tradingview-mcp/src/server.js"]

[mcp_servers.tradingview.tools.tv_health_check]
approval_mode = "approve"

[mcp_servers.tradingview.tools.chart_get_state]
approval_mode = "approve"

[mcp_servers.tradingview.tools.quote_get]
approval_mode = "approve"

[mcp_servers.tradingview.tools.data_get_ohlcv]
approval_mode = "approve"

[mcp_servers.tradingview.tools.data_get_study_values]
approval_mode = "approve"

[mcp_servers.tradingview.tools.data_get_pine_lines]
approval_mode = "approve"

[mcp_servers.tradingview.tools.data_get_pine_labels]
approval_mode = "approve"

[mcp_servers.tradingview.tools.data_get_pine_tables]
approval_mode = "approve"

[mcp_servers.tradingview.tools.chart_set_symbol]
approval_mode = "approve"

[mcp_servers.tradingview.tools.chart_set_timeframe]
approval_mode = "approve"

[mcp_servers.tradingview.tools.capture_screenshot]
approval_mode = "approve"

[mcp_servers.tradingview.tools.morning_brief]
approval_mode = "approve"
```

> **Nota para Codex**: Cada tool debe tener `approval_mode` declarado o Codex no lo carga. La lista de arriba cubre los tools mas comunes. Agrega mas segun necesites.

Reemplaza `TU_USUARIO` con tu usuario real. En Mac: `echo $USER` para verificar.

### 5. Verificar

Reinicia tu herramienta de IA y pregunta: *"Usa tv_health_check para verificar que TradingView esta conectado"*

### 6. Tu primer morning brief

Pregunta a Claude: *"Corre morning_brief y dame mi sesgo de sesion"*

O desde la terminal:
```bash
npm link  # instalar CLI tv globalmente (una vez)
tv brief
```

---

## Flujo del Morning Brief

Esta es la funcionalidad que convierte esto de un toolkit en un habito diario.

**Antes de cada sesion:**

1. TradingView esta abierto (lanzado con puerto de debug)
2. Corre: `tv brief` en tu terminal (o pregunta a Claude: *"corre morning_brief"*)
3. La IA escanea cada simbolo en tu watchlist, lee los valores de tus indicadores, aplica tus criterios de `rules.json` e imprime:

```
BTCUSD  | SESGO: Bajista  | NIVEL CLAVE: 94,200  | VIGILAR: RSI cruzando 50 en 4H
ETHUSD  | SESGO: Neutral  | NIVEL CLAVE: 3,180   | VIGILAR: Direccion de ribbon en diario
SOLUSD  | SESGO: Alcista  | NIVEL CLAVE: 178.50  | VIGILAR: Mantenerse sobre 20 EMA

General: Sesion cautelosa. BTC liderando bajista, SOL la excepcion — vigilar divergencia.
```

4. Guardalo: *"guarda este brief"* (usa `session_save`)
5. Manana compara: *"dame la sesion de ayer"* (usa `session_get`)

---

## Que hace esta herramienta

- **Morning brief** — escanea watchlist, lee indicadores, aplica reglas, imprime sesgo de sesion
- **Desarrollo Pine Script** — escribe, inyecta, compila, depura scripts con IA
- **Navegacion de chart** — cambia simbolos, timeframes, zoom a fechas, agrega/quita indicadores
- **Analisis visual** — lee valores de indicadores, niveles de precio, niveles dibujados por indicadores custom
- **Dibujar en charts** — lineas de tendencia, niveles horizontales, rectangulos, texto
- **Gestionar alertas** — crear, listar, eliminar alertas de precio
- **Practica en replay** — avanza barra por barra, practica entradas y salidas con seguimiento de P&L
- **Screenshots** — captura el estado del chart
- **Layouts multi-panel** — grids 2x2, 3x1 con diferentes simbolos por panel
- **Stream de datos** — salida JSONL desde tu chart en vivo para scripts de monitoreo
- **Acceso CLI** — cada tool tambien es un comando `tv`, salida JSON compatible con pipes

---

## Como sabe la IA que tool usar

La IA lee `CLAUDE.md` automaticamente cuando trabaja en este proyecto. Contiene el arbol de decisiones completo.

| Tu dices... | La IA usa... |
|-------------|-------------|
| "Corre mi morning brief" | `morning_brief` -> aplica reglas -> `session_save` |
| "Cual fue mi sesgo ayer?" | `session_get` |
| "Que hay en mi chart?" | `chart_get_state` -> `data_get_study_values` -> `quote_get` |
| "Dame un analisis completo" | `quote_get` -> `data_get_study_values` -> `data_get_pine_lines` -> `data_get_pine_labels` -> `capture_screenshot` |
| "Cambia a BTCUSD diario" | `chart_set_symbol` -> `chart_set_timeframe` |
| "Escribe un Pine Script para..." | `pine_set_source` -> `pine_smart_compile` -> `pine_get_errors` |
| "Inicia replay en marzo 1" | `replay_start` -> `replay_step` -> `replay_trade` |
| "Pon un grid de 4 charts" | `pane_set_layout` -> `pane_set_symbol` |
| "Dibuja un nivel en 94200" | `draw_shape` (horizontal_line) |

---

## Referencia de tools (81 MCP tools)

### Morning Brief (nuevo en este fork)

| Tool | Que hace |
|------|----------|
| `morning_brief` | Escanea watchlist, lee indicadores, devuelve datos estructurados para sesgo de sesion. Lee `rules.json` automaticamente. |
| `session_save` | Guarda el brief generado en `~/.tradingview-mcp/sessions/YYYY-MM-DD.json` |
| `session_get` | Recupera el brief de hoy (o el de ayer si hoy no se ha guardado) |

### Lectura del chart

| Tool | Cuando usar | Tamano de salida |
|------|-------------|-----------------|
| `chart_get_state` | Primera llamada — obtiene simbolo, timeframe, nombres de indicadores + IDs | ~500B |
| `data_get_study_values` | Lee valores actuales de RSI, MACD, BB, EMA de todos los indicadores | ~500B |
| `quote_get` | Obtiene ultimo precio, OHLC, volumen | ~200B |
| `data_get_ohlcv` | Obtiene barras de precio. **Usa `summary: true`** para stats compactos | 500B (summary) / 8KB (100 barras) |

### Datos de indicadores custom (Pine Drawings)

Lee la salida de `line.new()`, `label.new()`, `table.new()`, `box.new()` de cualquier indicador Pine visible.

| Tool | Cuando usar |
|------|-------------|
| `data_get_pine_lines` | Niveles horizontales de precio (soporte/resistencia, niveles de sesion) |
| `data_get_pine_labels` | Anotaciones de texto + precios ("PDH 24550", "Sesgo Largo") |
| `data_get_pine_tables` | Tablas de datos (stats de sesion, dashboards de analytics) |
| `data_get_pine_boxes` | Zonas de precio como pares {high, low} |

**Siempre usa `study_filter`** para apuntar a un indicador especifico: `study_filter: "MiIndicador"`.

### Control del chart

| Tool | Que hace |
|------|----------|
| `chart_set_symbol` | Cambiar ticker (BTCUSD, AAPL, ES1!, NYMEX:CL1!) |
| `chart_set_timeframe` | Cambiar resolucion (1, 5, 15, 60, D, W, M) |
| `chart_set_type` | Cambiar estilo (Candles, HeikinAshi, Line, Area, Renko) |
| `chart_manage_indicator` | Agregar/quitar indicadores. **Usa nombres completos**: "Relative Strength Index" no "RSI" |
| `chart_scroll_to_date` | Saltar a una fecha (ISO: "2025-01-15") |
| `indicator_set_inputs` / `indicator_toggle_visibility` | Cambiar settings de indicadores, mostrar/ocultar |

### Desarrollo Pine Script

| Tool | Paso |
|------|------|
| `pine_set_source` | 1. Inyectar codigo en el editor |
| `pine_smart_compile` | 2. Compilar con auto-deteccion + verificacion de errores |
| `pine_get_errors` | 3. Leer errores de compilacion si hay |
| `pine_get_console` | 4. Leer salida de log.info() |
| `pine_save` | 5. Guardar en la nube de TradingView |
| `pine_analyze` | Analisis estatico offline (no necesita chart) |
| `pine_check` | Verificacion de compilacion en servidor (no necesita chart) |

### Modo Replay

| Tool | Paso |
|------|------|
| `replay_start` | Entrar en replay en una fecha |
| `replay_step` | Avanzar una barra |
| `replay_autoplay` | Auto-avance (configura velocidad en ms) |
| `replay_trade` | Comprar/vender/cerrar posiciones |
| `replay_status` | Ver posicion, P&L, fecha |
| `replay_stop` | Volver a tiempo real |

### Multi-panel, alertas, dibujos, UI

| Tool | Que hace |
|------|----------|
| `pane_set_layout` | Cambiar grid: `s`, `2h`, `2v`, `2x2`, `4`, `6`, `8` |
| `pane_set_symbol` | Poner simbolo en cualquier panel |
| `draw_shape` | Dibujar horizontal_line, trend_line, rectangle, text |
| `alert_create` / `alert_list` / `alert_delete` | Gestionar alertas de precio |
| `batch_run` | Ejecutar accion en multiples simbolos/timeframes |
| `watchlist_get` / `watchlist_add` | Leer/modificar watchlist |
| `capture_screenshot` | Screenshot (regiones: full, chart, strategy_tester) |
| `tv_launch` / `tv_health_check` | Lanzar TradingView y verificar conexion |

---

## Comandos CLI

```bash
tv brief                           # correr morning brief
tv session get                     # obtener brief guardado de hoy
tv session save --brief "..."      # guardar un brief

tv status                          # verificar conexion
tv quote                           # precio actual
tv symbol BTCUSD                   # cambiar simbolo
tv ohlcv --summary                 # resumen de precio
tv screenshot -r chart             # capturar chart
tv pine compile                    # compilar Pine Script
tv pane layout 2x2                 # grid de 4 charts
tv stream quote | jq '.close'      # monitorear ticks de precio
```

Lista completa: `tv --help`

---

## Solucion de problemas

| Problema | Solucion |
|----------|----------|
| `cdp_connected: false` | TradingView no esta corriendo con `--remote-debugging-port=9222`. Usa el script de lanzamiento. |
| `ECONNREFUSED` | TradingView no esta corriendo o el puerto 9222 esta bloqueado |
| MCP server no aparece en Claude Code | Verifica la sintaxis de `~/.claude/mcp.json`, reinicia Claude Code |
| Comando `tv` no encontrado | Corre `npm link` desde el directorio del proyecto |
| `morning_brief` — "No rules.json found" | Corre `cp rules.example.json rules.json` y llenalo |
| `morning_brief` — watchlist vacia | Agrega simbolos al array `watchlist` en `rules.json` |
| Tools devuelven datos viejos | TradingView aun cargando — espera unos segundos |
| Tools de Pine Editor fallan | Abre el panel Pine Editor primero: `ui_open_panel pine-editor open` |

---

## Arquitectura

```
Claude Code / Claude Desktop / Codex  <->  MCP Server (stdio)  <->  CDP (puerto 9222)  <->  TradingView Desktop (Electron)
```

- **78 tools originales** + **3 tools de morning brief** = 81 MCP tools en total
- **Transporte**: MCP sobre stdio + CLI (comando `tv`)
- **Conexion**: Chrome DevTools Protocol en localhost:9222
- **Compatible con**: Claude Code, Claude Desktop, Codex (cualquier herramienta de IA con soporte MCP)
- **Seguridad**: Todos los inputs de usuario sanitizados via `escapeJsString()` / `validateNumber()` antes de evaluacion CDP
- **Sin llamadas externas** — todo corre localmente
- **Cero dependencias extra** mas alla del original

---

## Creditos

- Original [tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) de [@tradesdontlie](https://github.com/tradesdontlie) — la base
- [Fork de Jackson](https://github.com/LewisWJackson/tradingview-mcp-jackson) de [@LewisWJackson](https://github.com/LewisWJackson) — morning brief, config de reglas, fix de lanzamiento
- Seguridad y correccion de bugs por [@ulianbass](https://github.com/ulianbass)

---

## Aviso legal

Este proyecto se proporciona **solo para fines personales, educativos y de investigacion**.

Esta herramienta usa el Chrome DevTools Protocol (CDP), una interfaz de depuracion estandar integrada en todas las aplicaciones basadas en Chromium. No hace ingenieria inversa de ningun protocolo propietario de TradingView, no se conecta a los servidores de TradingView, ni evita ningun control de acceso. El puerto de debug debe ser habilitado explicitamente por el usuario mediante un flag estandar de Chromium.

Al usar este software aceptas que:

1. Eres el unico responsable de asegurar que tu uso cumple con los [Terminos de Uso de TradingView](https://www.tradingview.com/policies/) y todas las leyes aplicables.
2. Esta herramienta accede a APIs internas no documentadas de TradingView que pueden cambiar en cualquier momento.
3. Esta herramienta no debe usarse para redistribuir, revender o explotar comercialmente los datos de mercado de TradingView.
4. Los autores no son responsables de ningun ban de cuenta, suspension u otras consecuencias.

**Usa bajo tu propio riesgo.**

## Licencia

MIT — ver [LICENSE](LICENSE). Aplica solo al codigo fuente, no al software, datos o marcas de TradingView.
