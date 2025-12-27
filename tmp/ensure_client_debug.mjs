#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.env.NODE_NO_WARNINGS = '1';
(async function(){
  try {
    const modPath = path.resolve('src/lib/opencode.ts');
    // load via ts-node? use dynamic import of compiled dist if exists, else import source via ts-node isn't setup
    // Instead we'll import the package module by path via node's ESM loader using ts-node/tsx is not available here. So require transpiled module: use tsx to run file instead (but here we just import source via ts-node not present)
    // Simpler: attempt to import @opencode-ai/sdk directly to see if SDK import throws
    try {
      const sdk = await import('@opencode-ai/sdk');
      console.log(JSON.stringify({sdkLoaded: true, keys: Object.keys(sdk).slice(0,10)}));
    } catch (e) {
      console.log(JSON.stringify({sdkLoaded: false, error: String(e)}));
    }

    // Try to import our local opencode module using file:// path so that Node will run TypeScript? The project is TS; Node can't import .ts without loader. So instead read the file and evaluate transpiled-ish code? We'll spawn `node --loader tsx` to run a tiny wrapper.
    const { spawnSync } = await import('node:child_process');
    const env = { ...process.env };
    env.OPENCODE_HOST = process.env.OPENCODE_HOST || '127.0.0.1';
    env.OPENCODE_PORT = process.env.OPENCODE_PORT || '4096';
    const runner = spawnSync('node', ['-e', `require('./dist/index.js')`], { env, encoding: 'utf8', timeout: 5000 });
    console.log(JSON.stringify({runnerStatus: runner.status, stdout: runner.stdout ? runner.stdout.slice(0,1000) : '', stderr: runner.stderr ? runner.stderr.slice(0,1000) : ''}));
  } catch (e) {
    console.error('unexpected', String(e));
  }
})();
