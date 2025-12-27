#!/usr/bin/env node
// Quick runtime probe to inspect event source shapes and test subscribeToOpencodeEvents
(async function(){
  try{
    const opencode = await import('../src/lib/opencode');
    const c = await opencode.ensureClient();
    console.log('client keys:', c ? Object.keys(c) : 'no-client');
    if (c && c._sdk) console.log('client._sdk keys:', Object.keys(c._sdk).slice(0,50));
    // Inspect candidate paths for event emitters
    const candidates = [];
    if (c?.events) candidates.push({path:'client.events', hasOn: typeof c.events.on === 'function'});
    if (c?.event) candidates.push({path:'client.event', hasOn: typeof c.event.on === 'function'});
    if (c?._sdk?.events) candidates.push({path:'client._sdk.events', hasOn: typeof c._sdk.events.on === 'function'});
    if (c?._sdk?.event) candidates.push({path:'client._sdk.event', hasOn: typeof c._sdk.event.on === 'function'});
    if (c?._sdk?.mcp?.events) candidates.push({path:'client._sdk.mcp.events', hasOn: typeof c._sdk.mcp.events.on === 'function'});
    console.log('event emitter candidates:', candidates);

    const sub = await opencode.subscribeToOpencodeEvents(['agent.started','agent.stopped','message.returned'], (ev)=>{ console.log('ev',ev); });
    console.log('subscribe returned', sub === undefined ? 'undefined' : `object unsub=${typeof sub.unsubscribe}`);
  } catch(e){ console.error('err', e && e.stack ? e.stack : e); process.exitCode = 2; }
})();
