const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.DROPBEAT_PORT || 3211);
const origin = `http://127.0.0.1:${port}`;
async function ready() {
  try {
    const r = await fetch(`${origin}/api/simulator/health`, {signal: AbortSignal.timeout(1500)});
    const body = await r.json();
    return r.ok && body.app === 'dropbeat' && body.simulator;
  } catch { return false; }
}
(async () => {
  if (await ready()) { console.log('DropBeat studio ready.'); return; }
  let occupied = false;
  try { await fetch(origin, {signal: AbortSignal.timeout(1500)}); occupied = true; } catch {}
  if (occupied) throw new Error(`Port ${port} is already in use. Stop its server or set DROPBEAT_PORT and update Advanced in the app.`);
  const dir = path.join(root, '.ios-runtime'); fs.mkdirSync(dir, {recursive: true});
  const log = fs.openSync(path.join(dir, 'server.log'), 'a');
  const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root, detached: true, stdio: ['ignore', log, log],
    env: {...process.env, KRIYA_IOS_SIMULATOR: '1', KRIYA_NEXT_DIST_DIR: '.next-ios', NODE_ENV: 'development'}
  });
  child.unref(); fs.closeSync(log); fs.writeFileSync(path.join(dir, 'server.pid'), String(child.pid));
  for (let i = 0; i < 90; i++) {
    if (await ready()) { console.log(`DropBeat studio ready at ${origin}`); return; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Studio did not start. Check studio/.ios-runtime/server.log.');
})().catch(error => {console.error('error: ' + error.message); process.exitCode = 1;});
