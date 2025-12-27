// Debug script for OpenCode / OODA ingester
async function run() {
  console.log('--- ooda_debug START ---');
  const env = { OPENCODE_ENABLED: process.env.OPENCODE_ENABLED, OPENCODE_HOST: process.env.OPENCODE_HOST, OPENCODE_PORT: process.env.OPENCODE_PORT, OPENCODE_STARTUP_TIMEOUT: process.env.OPENCODE_STARTUP_TIMEOUT };
  console.log('env:', JSON.stringify(env));

  // 1) try to directly import SDK
  try {
    const sdk = await import('@opencode-ai/sdk');
    console.log('sdk import: OK', Object.keys(sdk).slice(0,20));
  } catch (e:any) {
    console.log('sdk import: FAILED', e && e.stack ? e.stack : String(e));
  }

  // 2) import opencode module
  let opencode:any;
  try {
    opencode = await import('../src/lib/opencode');
    console.log('imported ../src/lib/opencode');
  } catch (e:any) {
    console.error('failed importing opencode module:', e && e.stack ? e.stack : String(e));
    process.exitCode = 2;
    return;
  }

  // 3) call isEnabled()
  try {
    const enabled = typeof opencode.isEnabled === 'function' ? opencode.isEnabled() : 'missing';
    console.log('isEnabled ->', enabled);
  } catch (e:any) { console.log('isEnabled threw:', e && e.stack ? e.stack : String(e)); }

  // 4) call ensureClient()
  try {
    const start = Date.now();
    const client = await opencode.ensureClient();
    const took = Date.now() - start;
    console.log('ensureClient returned:', client === undefined ? 'undefined' : `object (keys: ${Object.keys(client).slice(0,20).join(',')})`, 'took_ms:', took);
    if (client && client._sdk) console.log('client._sdk keys:', Object.keys(client._sdk).slice(0,50));
  } catch (e:any) { console.log('ensureClient threw:', e && e.stack ? e.stack : String(e)); }

  // 5) call subscribeToOpencodeEvents
  try {
    const handler = (ev:any) => { console.log('handler invoked for', ev); };
    const sub = await opencode.subscribeToOpencodeEvents(['agent.started','agent.stopped','message.returned'], handler);
    console.log('subscribeToOpencodeEvents returned:', sub === undefined ? 'undefined' : `object (has unsubscribe: ${typeof sub.unsubscribe === 'function'})`);
    if (sub && typeof sub.unsubscribe === 'function') {
      console.log('calling unsubscribe immediately to test detach');
      try { sub.unsubscribe(); console.log('unsubscribe OK'); } catch (e:any) { console.log('unsubscribe threw', e && e.stack ? e.stack : String(e)); }
    }
  } catch (e:any) { console.log('subscribeToOpencodeEvents threw:', e && e.stack ? e.stack : String(e)); }

  // 6) import ooda ingester and run runIngester with once:true and log:false to see behavior
  try {
    const ingester = await import('../src/lib/ooda-ingester');
    console.log('imported ooda-ingester');
    const start = Date.now();
    const res = await ingester.runIngester({ once: true, log: false, sample: false });
    const took = Date.now() - start;
    console.log('runIngester returned:', res === undefined ? 'undefined' : `value (${typeof res})`, 'took_ms:', took);
  } catch (e:any) { console.log('runIngester threw:', e && e.stack ? e.stack : String(e)); }

  // 7) check history file
  try {
    const fs = await import('node:fs');
    const path = 'history/ooda_status.jsonl';
    const exists = fs.existsSync(path);
    console.log('history file exists:', exists);
    if (exists) {
      const stat = fs.statSync(path);
      console.log('history file size:', stat.size);
      const tail = fs.readFileSync(path,'utf8').split(/\r?\n/).filter(Boolean).slice(-5);
      console.log('last lines:', tail);
    }
  } catch (e:any) { console.log('history inspect threw:', e && e.stack ? e.stack : String(e)); }

  console.log('--- ooda_debug END ---');
}

run().catch(e=>{ console.error('fatal', e && e.stack ? e.stack : String(e)); process.exitCode = 1; });
