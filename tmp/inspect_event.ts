(async function(){
  try{
    const opencode = await import('../src/lib/opencode');
    const client = await opencode.ensureClient();
    if(!client){ console.log('no client'); return; }
    const sdk = client._sdk;
    console.log('client present, client keys:', Object.keys(client));
    if(!sdk){ console.log('no _sdk'); return; }
    console.log('_sdk keys:', Object.keys(sdk).slice(0,200));

    const ev = sdk.event ?? sdk.events ?? sdk._event ?? sdk.mcp?.events ?? sdk.mcp?.event;
    console.log('selected event path present?', !!ev);
    if(!ev){
      // print some candidates
      const cand = ['event','events','mcp','mcp.events','mcp.event'];
      for(const k of cand){
        try{
          const val = k.split('.').reduce((acc, p) => acc && acc[p], sdk);
          console.log('candidate',k, '->', val === undefined ? 'undefined' : (val && typeof val === 'object' ? `object keys:${Object.keys(val).slice(0,20).join(',')}` : typeof val));
        }catch(e){console.log('candidate',k,'-> error',String(e));}
      }
      return;
    }

    // Print info about ev
    console.log('ev type:', typeof ev);
    try{ console.log('ev keys:', Object.keys(ev).slice(0,200)); }catch(e){ console.log('ev keys error',String(e)); }
    try{ console.log('proto keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(ev)).slice(0,200)); }catch(e){ console.log('proto error',String(e)); }

    const methods = ['on','off','addListener','removeListener','subscribe','listen','attach','register','addEventListener','publish','emit'];
    for(const m of methods){ console.log('method',m, 'exists?', typeof ev[m] === 'function'); }

    // if subscribe exists, try to call with a no-op
    if(typeof ev.subscribe === 'function'){
      console.log('trying ev.subscribe...');
      try{ const s = ev.subscribe((e:any)=>{}); console.log('subscribe returned', s); }catch(e){ console.log('subscribe call failed',String(e)); }
    }

  }catch(e){ console.error('inspect failed', e && e.stack ? e.stack : String(e)); process.exitCode=2; }
})();
