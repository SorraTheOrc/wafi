#!/usr/bin/env node
const host = process.env.OPENCODE_HOST || '127.0.0.1';
const port = Number(process.env.OPENCODE_PORT || 4096);
const timeout = Number(process.env.CHECK_TIMEOUT_MS || 500);
import net from 'node:net';
(async function(){
  const socket = new net.Socket();
  let done = false;
  socket.setTimeout(timeout);
  socket.on('connect', () => { done = true; console.log(JSON.stringify({reachable:true, host, port})); socket.destroy(); });
  socket.on('error', (e) => { if (!done) { done = true; console.log(JSON.stringify({reachable:false, host, port, error: String(e)})); } });
  socket.on('timeout', () => { if (!done) { done = true; console.log(JSON.stringify({reachable:false, host, port, error: 'timeout'})); socket.destroy(); } });
  try { socket.connect(port, host); } catch (e) { if (!done) { done = true; console.log(JSON.stringify({reachable:false, host, port, error: String(e)})); } }
  // ensure process doesn't hang
  setTimeout(()=>{ if(!done) console.log(JSON.stringify({reachable:false, host, port, error:'timeout-fallback'})); }, timeout+200);
})();
