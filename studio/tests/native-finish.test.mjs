import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../app/create/music-video/native/stage.tsx', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
async function harness({ failures = 0, blenderFails = false, saved = [], saveFails = false } = {}) {
  const messages = [], stored = new Map(), attempts = []; let finish; let cleanup;
  const window = { webkit: { messageHandlers: { studio: { postMessage: m => messages.push(m) } } } };
  class Engine { active = false; constructor(_c, _s, callback) { finish = callback; } async start() {} destroy() {} }
  const modules = {
    react: { useEffect: f => { cleanup = f(); }, useRef: () => ({ current: {} }) },
    'react/jsx-runtime': { jsx: () => null },
    '../_lib/engine': { StudioEngine: Engine, api: async () => ({ reactor: true, gemini: true, desktop: true, blender: true }) },
    '../_lib/lyrics': { openingCue: () => ({}) },
    '../_lib/types': { buildDirection: () => '' },
    '../_lib/storage': { saveTake: async take => { if(saveFails) throw Error('disk'); saved.push(take); }, listTakes: async () => saved }
  };
  const exports = {};
  vm.runInNewContext(js, { exports, require: n => modules[n], window, localStorage: { getItem: k => stored.get(k), setItem: (k,v) => stored.set(k,v), removeItem: k => stored.delete(k) }, crypto, FormData, setTimeout: f => { f(); }, fetch: async url => {
    if(url.endsWith('/finalize')) { attempts.push(url); return { ok: attempts.length > failures, json: async () => ({ id: 'export', url: '/final', error: 'provider failure' }) }; }
    if(url.endsWith('/refine')) return { ok: !blenderFails, json: async () => ({ url: '/polished', error: 'blender' }) };
    return { ok: true, json: async () => ({}) };
  } });
  exports.default(); await new Promise(setImmediate);
  return { window, stored, messages, attempts, cleanup, async record() { await window.kriyaNative.start('SF rap', 'rap'); finish(new Blob(['recording']), 60); for(let i=0;i<30;i++) await new Promise(setImmediate); } };
}
test('failed song retries twice and sends only the final polished video', async () => {
  const h = await harness({ failures: 2 }); await h.record();
  assert.equal(h.attempts.length,3); assert.equal(h.stored.get('nativePendingTake'),undefined);
  assert.equal(h.stored.get('nativeFinishedURL'),'/polished');
  assert.deepEqual(h.messages.filter(m=>m.finished).map(m=>m.finished),['/polished']);
});
test('exhausted attempts preserve recording and manual retry uses it', async () => {
  const h=await harness({ failures:3 }); await h.record();
  assert.equal(h.attempts.length,3); assert.ok(h.stored.get('nativePendingTake'));
  assert.equal(h.messages.at(-1).canRetry,true); assert.match(h.messages.at(-1).error,/recording is saved/);
  await h.window.kriyaNative.retry(); assert.equal(h.attempts.length,4); assert.equal(h.stored.get('nativeFinishedURL'),'/polished');
});
test('Blender failure still delivers video with completed song',async()=>{
 const h=await harness({blenderFails:true}); await h.record();
 assert.equal(h.messages.at(-1).finished,'/final'); assert.match(h.messages.at(-1).completionNote,/Blender polish failed/);
});
test('save failure never claims the recording was saved or starts a paid song',async()=>{
 const h=await harness({saveFails:true}); await h.record(); assert.equal(h.attempts.length,0);
 assert.match(h.messages.at(-1).error,/Could not save/); assert.equal(h.messages.at(-1).canRetry,true);
});
test('existing recordings are recoverable after reopening the app',async()=>{
 const h=await harness({saved:[{id:'saved-take'}]});
 assert.equal(h.stored.get('nativePendingTake'),'saved-take'); assert.equal(h.messages.at(-1).canRetry,true);
});
