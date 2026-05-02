/**
 * tv_launch unit tests.
 *
 * These mock process/platform/CDP dependencies so the default test suite
 * can verify launcher behavior without opening or killing TradingView.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from '../src/core/health.js';

function child(pid = 1234) {
  return {
    pid,
    on() {},
    unref() {},
  };
}

function baseDeps(overrides = {}) {
  const calls = {
    execFileSync: [],
    execSync: [],
    spawn: [],
  };
  const deps = {
    env: { HOME: '/Users/test' },
    platform: 'darwin',
    existsSync: (path) => path === '/Applications/TradingView.app/Contents/MacOS/TradingView',
    execFileSync: (...args) => {
      calls.execFileSync.push(args);
      if (args[0] === 'pgrep') throw new Error('not running');
      return Buffer.from('');
    },
    execSync: (...args) => {
      calls.execSync.push(args);
      return Buffer.from('');
    },
    spawn: (...args) => {
      calls.spawn.push(args);
      return child();
    },
    sleep: async () => {},
    getCdpVersion: async () => null,
    ...overrides,
  };
  return { deps, calls };
}

describe('tv_launch', () => {
  it('returns the existing CDP session without spawning another app', async () => {
    const { deps, calls } = baseDeps({
      getCdpVersion: async () => ({ Browser: 'TradingView/3.1.0', 'User-Agent': 'test-agent' }),
    });

    const result = await launch({ port: 9222, kill_existing: false, _deps: deps });

    assert.equal(result.success, true);
    assert.equal(result.cdp_ready, true);
    assert.equal(result.already_running, true);
    assert.equal(calls.spawn.length, 0);
  });

  it('reports restart_required when TradingView is already open without CDP and kill_existing is false', async () => {
    const { deps, calls } = baseDeps({
      execFileSync: (...args) => {
        calls.execFileSync.push(args);
        return Buffer.from('123\n');
      },
    });

    const result = await launch({ port: 9222, kill_existing: false, _deps: deps });

    assert.equal(result.success, false);
    assert.equal(result.restart_required, true);
    assert.equal(result.tradingview_running, true);
    assert.equal(calls.spawn.length, 0);
  });

  it('uses macOS open --args fallback when direct launch never exposes CDP', async () => {
    let cdpChecks = 0;
    const { deps, calls } = baseDeps({
      getCdpVersion: async () => {
        cdpChecks += 1;
        return cdpChecks >= 17
          ? { Browser: 'TradingView/3.1.0', 'User-Agent': 'fallback-agent' }
          : null;
      },
    });

    const result = await launch({ port: 9222, kill_existing: true, _deps: deps });

    assert.equal(result.success, true);
    assert.equal(result.fallback_used, true);
    assert.equal(result.launch_method, 'mac_open_args');
    assert.ok(calls.spawn.some(([cmd]) => cmd === '/Applications/TradingView.app/Contents/MacOS/TradingView'));
    assert.ok(calls.execFileSync.some(([cmd, args]) => cmd === 'open' && args.includes('--args')));
    assert.ok(
      calls.execFileSync.some(([cmd, args]) =>
        cmd === 'pkill' && args[0] === '-f' && args[1] === '/TradingView.app/Contents/',
      ),
      'uses narrow TradingView app-process match instead of broad pkill -f TradingView',
    );
  });
});
