/**
 * Core health/discovery/launch logic.
 */
import { getClient, getTargetInfo, evaluate } from '../connection.js';
import { existsSync } from 'fs';
import http from 'node:http';
import { execFileSync, execSync, spawn } from 'child_process';

function defaultDeps(overrides = {}) {
  return {
    env: process.env,
    platform: process.platform,
    existsSync,
    execFileSync,
    execSync,
    spawn,
    httpGet: http.get,
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    ...overrides,
  };
}

function appBundleFromBinary(tvPath) {
  const match = tvPath.match(/^(.+\.app)\//);
  return match ? match[1] : null;
}

async function getCdpVersion(port, deps = defaultDeps()) {
  return new Promise((resolve) => {
    const req = deps.httpGet(`http://localhost:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

async function waitForCdp(port, { attempts = 15, delayMs = 1000, deps = defaultDeps() } = {}) {
  const getVersion = deps.getCdpVersion || ((p) => getCdpVersion(p, deps));
  for (let i = 0; i < attempts; i++) {
    await deps.sleep(delayMs);
    const info = await getVersion(port);
    if (info) return info;
  }
  return null;
}

function isTradingViewRunning(platform, deps = defaultDeps()) {
  try {
    if (platform === 'win32') {
      const output = deps.execSync('tasklist /FI "IMAGENAME eq TradingView.exe" /NH', { timeout: 5000 }).toString();
      return /TradingView\.exe/i.test(output);
    }
    if (platform === 'darwin') {
      deps.execFileSync('pgrep', ['-f', '/TradingView.app/Contents/'], { timeout: 5000 });
      return true;
    }
    try {
      deps.execFileSync('pgrep', ['-x', 'tradingview'], { timeout: 5000 });
      return true;
    } catch {
      deps.execFileSync('pgrep', ['-x', 'TradingView'], { timeout: 5000 });
      return true;
    }
  } catch {
    return false;
  }
}

function killTradingView(platform, deps = defaultDeps()) {
  try {
    if (platform === 'win32') {
      deps.execSync('taskkill /F /IM TradingView.exe', { timeout: 5000 });
      return;
    }
    if (platform === 'darwin') {
      deps.execFileSync('pkill', ['-f', '/TradingView.app/Contents/'], { timeout: 5000 });
      return;
    }
    try { deps.execFileSync('pkill', ['-x', 'tradingview'], { timeout: 5000 }); } catch {}
    try { deps.execFileSync('pkill', ['-x', 'TradingView'], { timeout: 5000 }); } catch {}
  } catch {
    // May not be running.
  }
}

function launchDirect(tvPath, cdpPort, deps) {
  const child = deps.spawn(tvPath, [`--remote-debugging-port=${cdpPort}`], {
    detached: true,
    stdio: 'ignore',
  });
  if (typeof child?.on === 'function') child.on('error', () => {});
  if (typeof child?.unref === 'function') child.unref();
  return child;
}

async function launchViaMacOpen(tvPath, cdpPort, deps) {
  const appBundle = appBundleFromBinary(tvPath);
  if (!appBundle) return false;
  try {
    deps.execFileSync('open', ['-a', appBundle, '--args', `--remote-debugging-port=${cdpPort}`], { timeout: 5000 });
  } catch {
    // `open` can return non-zero even when launch continues asynchronously.
  }
  await deps.sleep(1000);
  return true;
}

export async function healthCheck() {
  await getClient();
  const target = await getTargetInfo();

  const state = await evaluate(`
    (function() {
      var result = { url: window.location.href, title: document.title };
      try {
        var chart = window.TradingViewApi._activeChartWidgetWV.value();
        result.symbol = chart.symbol();
        result.resolution = chart.resolution();
        result.chartType = chart.chartType();
        result.apiAvailable = true;
      } catch(e) {
        result.symbol = 'unknown';
        result.resolution = 'unknown';
        result.chartType = null;
        result.apiAvailable = false;
        result.apiError = e.message;
      }
      return result;
    })()
  `);

  return {
    success: true,
    cdp_connected: true,
    target_id: target.id,
    target_url: target.url,
    target_title: target.title,
    chart_symbol: state?.symbol || 'unknown',
    chart_resolution: state?.resolution || 'unknown',
    chart_type: state?.chartType ?? null,
    api_available: state?.apiAvailable ?? false,
  };
}

export async function discover() {
  const paths = await evaluate(`
    (function() {
      var results = {};
      try {
        var chart = window.TradingViewApi._activeChartWidgetWV.value();
        var methods = [];
        for (var k in chart) { if (typeof chart[k] === 'function') methods.push(k); }
        results.chartApi = { available: true, path: 'window.TradingViewApi._activeChartWidgetWV.value()', methodCount: methods.length, methods: methods.slice(0, 50) };
      } catch(e) { results.chartApi = { available: false, error: e.message }; }
      try {
        var col = window.TradingViewApi._chartWidgetCollection;
        var colMethods = [];
        for (var k in col) { if (typeof col[k] === 'function') colMethods.push(k); }
        results.chartWidgetCollection = { available: !!col, path: 'window.TradingViewApi._chartWidgetCollection', methodCount: colMethods.length, methods: colMethods.slice(0, 30) };
      } catch(e) { results.chartWidgetCollection = { available: false, error: e.message }; }
      try {
        var ws = window.ChartApiInstance;
        var wsMethods = [];
        for (var k in ws) { if (typeof ws[k] === 'function') wsMethods.push(k); }
        results.chartApiInstance = { available: !!ws, path: 'window.ChartApiInstance', methodCount: wsMethods.length, methods: wsMethods.slice(0, 30) };
      } catch(e) { results.chartApiInstance = { available: false, error: e.message }; }
      try {
        var bwb = window.TradingView && window.TradingView.bottomWidgetBar;
        var bwbMethods = [];
        if (bwb) { for (var k in bwb) { if (typeof bwb[k] === 'function') bwbMethods.push(k); } }
        results.bottomWidgetBar = { available: !!bwb, path: 'window.TradingView.bottomWidgetBar', methodCount: bwbMethods.length, methods: bwbMethods.slice(0, 20) };
      } catch(e) { results.bottomWidgetBar = { available: false, error: e.message }; }
      try {
        var replay = window.TradingViewApi._replayApi;
        results.replayApi = { available: !!replay, path: 'window.TradingViewApi._replayApi' };
      } catch(e) { results.replayApi = { available: false, error: e.message }; }
      try {
        var alerts = window.TradingViewApi._alertService;
        results.alertService = { available: !!alerts, path: 'window.TradingViewApi._alertService' };
      } catch(e) { results.alertService = { available: false, error: e.message }; }
      return results;
    })()
  `);

  const available = Object.values(paths).filter(v => v.available).length;
  const total = Object.keys(paths).length;

  return { success: true, apis_available: available, apis_total: total, apis: paths };
}

export async function uiState() {
  const state = await evaluate(`
    (function() {
      var ui = {};
      var bottom = document.querySelector('[class*="layout__area--bottom"]');
      ui.bottom_panel = { open: !!(bottom && bottom.offsetHeight > 50), height: bottom ? bottom.offsetHeight : 0 };
      var right = document.querySelector('[class*="layout__area--right"]');
      ui.right_panel = { open: !!(right && right.offsetWidth > 50), width: right ? right.offsetWidth : 0 };
      var monacoEl = document.querySelector('.monaco-editor.pine-editor-monaco');
      ui.pine_editor = { open: !!monacoEl, width: monacoEl ? monacoEl.offsetWidth : 0, height: monacoEl ? monacoEl.offsetHeight : 0 };
      var stratPanel = document.querySelector('[data-name="backtesting"]') || document.querySelector('[class*="strategyReport"]');
      ui.strategy_tester = { open: !!(stratPanel && stratPanel.offsetParent) };
      var widgetbar = document.querySelector('[data-name="widgetbar-wrap"]');
      ui.widgetbar = { open: !!(widgetbar && widgetbar.offsetWidth > 50) };
      ui.buttons = {};
      var btns = document.querySelectorAll('button');
      var seen = {};
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (b.offsetParent === null || b.offsetWidth < 15) continue;
        var text = b.textContent.trim();
        var aria = b.getAttribute('aria-label') || '';
        var dn = b.getAttribute('data-name') || '';
        var label = text || aria || dn;
        if (!label || label.length > 60) continue;
        var key = label.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 40);
        if (seen[key]) continue;
        seen[key] = true;
        var rect = b.getBoundingClientRect();
        var region = 'other';
        if (rect.y < 50) region = 'top_bar';
        else if (rect.y < 90 && rect.x < 650) region = 'toolbar';
        else if (rect.x < 45) region = 'left_sidebar';
        else if (rect.x > 650 && rect.y < 100) region = 'pine_header';
        else if (rect.y > 750) region = 'bottom_bar';
        if (!ui.buttons[region]) ui.buttons[region] = [];
        ui.buttons[region].push({ label: label.substring(0, 40), disabled: b.disabled, x: Math.round(rect.x), y: Math.round(rect.y) });
      }
      ui.key_buttons = {};
      var keyLabels = {
        'add_to_chart': /add to chart/i, 'save_and_add': /save and add/i,
        'update_on_chart': /update on chart/i, 'save': /^Save(Save)?$/,
        'saved': /^Saved/, 'publish_script': /publish script/i,
        'compile_errors': /error/i, 'unsaved_version': /unsaved version/i,
      };
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (b.offsetParent === null) continue;
        var text = b.textContent.trim();
        for (var k in keyLabels) {
          if (keyLabels[k].test(text)) {
            ui.key_buttons[k] = { text: text.substring(0, 40), disabled: b.disabled, visible: b.offsetWidth > 0 };
          }
        }
      }
      try {
        var chart = window.TradingViewApi._activeChartWidgetWV.value();
        ui.chart = { symbol: chart.symbol(), resolution: chart.resolution(), chartType: chart.chartType(), study_count: chart.getAllStudies().length };
      } catch(e) { ui.chart = { error: e.message }; }
      try {
        var replay = window.TradingViewApi._replayApi;
        function unwrap(v) { return (v && typeof v === 'object' && typeof v.value === 'function') ? v.value() : v; }
        ui.replay = { available: unwrap(replay.isReplayAvailable()), started: unwrap(replay.isReplayStarted()) };
      } catch(e) { ui.replay = { error: e.message }; }
      return ui;
    })()
  `);

  return { success: true, ...state };
}

export async function launch({ port, kill_existing, _deps } = {}) {
  const deps = defaultDeps(_deps);
  const cdpPort = port || 9222;
  const killFirst = kill_existing !== false;
  const platform = deps.platform;

  const existingCdp = await (deps.getCdpVersion || ((p) => getCdpVersion(p, deps)))(cdpPort);
  if (existingCdp) {
    return {
      success: true,
      platform,
      cdp_port: cdpPort,
      cdp_ready: true,
      already_running: true,
      cdp_url: `http://localhost:${cdpPort}`,
      browser: existingCdp.Browser,
      user_agent: existingCdp['User-Agent'],
    };
  }

  const pathMap = {
    darwin: [
      '/Applications/TradingView.app/Contents/MacOS/TradingView',
      `${deps.env.HOME}/Applications/TradingView.app/Contents/MacOS/TradingView`,
    ],
    win32: [
      `${deps.env.LOCALAPPDATA}\\TradingView\\TradingView.exe`,
      `${deps.env.PROGRAMFILES}\\TradingView\\TradingView.exe`,
      `${deps.env['PROGRAMFILES(X86)']}\\TradingView\\TradingView.exe`,
    ],
    linux: [
      '/opt/TradingView/tradingview',
      '/opt/TradingView/TradingView',
      `${deps.env.HOME}/.local/share/TradingView/TradingView`,
      '/usr/bin/tradingview',
      '/snap/tradingview/current/tradingview',
    ],
  };

  let tvPath = null;
  const candidates = pathMap[platform] || pathMap.linux;
  for (const p of candidates) {
    if (p && deps.existsSync(p)) { tvPath = p; break; }
  }

  if (!tvPath) {
    try {
      const cmd = platform === 'win32' ? 'where TradingView.exe' : 'which tradingview';
      tvPath = deps.execSync(cmd, { timeout: 3000 }).toString().trim().split('\n')[0];
      if (tvPath && !deps.existsSync(tvPath)) tvPath = null;
    } catch { /* ignore */ }
  }

  if (!tvPath && platform === 'darwin') {
    try {
      const found = deps.execSync('mdfind "kMDItemFSName == TradingView.app" | head -1', { timeout: 5000 }).toString().trim();
      if (found) {
        const candidate = `${found}/Contents/MacOS/TradingView`;
        if (deps.existsSync(candidate)) tvPath = candidate;
      }
    } catch { /* ignore */ }
  }

  if (!tvPath) {
    throw new Error(`TradingView not found on ${platform}. Searched: ${candidates.join(', ')}. Launch manually with: /path/to/TradingView --remote-debugging-port=${cdpPort}`);
  }

  if (!killFirst && isTradingViewRunning(platform, deps)) {
    return {
      success: false,
      platform,
      binary: tvPath,
      cdp_port: cdpPort,
      cdp_ready: false,
      tradingview_running: true,
      restart_required: true,
      warning:
        'TradingView is already running but CDP is not responding. macOS/Electron usually reuses the existing app instance and ignores a second launch with --remote-debugging-port. Quit TradingView first or run tv_launch with kill_existing: true.',
    };
  }

  if (killFirst) {
    killTradingView(platform, deps);
    await deps.sleep(1500);
  }

  const child = launchDirect(tvPath, cdpPort, deps);

  const info = await waitForCdp(cdpPort, { deps });
  if (info) {
    return {
      success: true, platform, binary: tvPath, pid: child.pid,
      cdp_port: cdpPort, cdp_ready: true, cdp_url: `http://localhost:${cdpPort}`,
      launch_method: 'direct',
      browser: info.Browser, user_agent: info['User-Agent'],
    };
  }

  if (platform === 'darwin') {
    // TradingView v2.14+ / Electron 38 can reject Chromium flags passed
    // directly to the binary. Restart once and use macOS `open --args`.
    killTradingView(platform, deps);
    await deps.sleep(1500);
    const attemptedOpen = await launchViaMacOpen(tvPath, cdpPort, deps);
    const fallbackInfo = attemptedOpen ? await waitForCdp(cdpPort, { deps }) : null;
    if (fallbackInfo) {
      return {
        success: true,
        platform,
        binary: tvPath,
        pid: null,
        cdp_port: cdpPort,
        cdp_ready: true,
        cdp_url: `http://localhost:${cdpPort}`,
        launch_method: 'mac_open_args',
        fallback_used: true,
        browser: fallbackInfo.Browser,
        user_agent: fallbackInfo['User-Agent'],
      };
    }
  }

  return {
    success: false, platform, binary: tvPath, pid: child.pid, cdp_port: cdpPort, cdp_ready: false,
    warning:
      `TradingView launched but CDP is not available on port ${cdpPort}. ` +
      'If TradingView is already open, quit it completely and relaunch with CDP enabled. ' +
      'On macOS TradingView v2.14+ may require launch via `open -a TradingView --args --remote-debugging-port=' + cdpPort + '`.',
  };
}
