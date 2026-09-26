import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../app/create/music-video/_lib/types.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};vm.runInNewContext(js,{exports});
const {buildDirection,clock,PRESETS}=exports;
test('introducing a subject retains the existing setting',()=>{const result=buildDirection('ocean at dusk',{kind:'subject',description:'an orange tiger swimming'});assert.match(result,/Keep the current setting: ocean at dusk/);assert.match(result,/Introduce this subject: an orange tiger swimming/);});
test('atmosphere cues preserve subjects rather than replacing the location',()=>{const result=buildDirection('ocean with a sailboat',{kind:'atmosphere',description:'golden sunset'});assert.match(result,/Keep the current setting and subjects: ocean with a sailboat/);assert.match(result,/Change only the atmosphere/);});
test('location cues explicitly permit a scene transition',()=>assert.match(buildDirection('ocean',{kind:'location',description:'neon city'}),/Transition gradually from ocean into neon city/));
test('all palette images are bundled and have musical directions',()=>{assert.equal(PRESETS.length,4);for(const preset of PRESETS){assert.ok(fs.existsSync(new URL('../public'+preset.image,import.meta.url)));assert.ok(preset.music.length>30);}});
test('timeline timestamps never round into a future minute',()=>{assert.equal(clock(59.99),'00:59');assert.equal(clock(60),'01:00');assert.equal(clock(180),'03:00');});
const lyricsSource=fs.readFileSync(new URL('../app/create/music-video/_lib/lyrics.ts',import.meta.url),'utf8');
const lyricsJS=ts.transpileModule(lyricsSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const lyricExports={};vm.runInNewContext(lyricsJS,{exports:lyricExports,require:()=>exports});
test('English lyric drafts follow picture and text directions',()=>{
  assert.match(lyricExports.draftLyrics('a tiger swimming').join(' '),/stripes/);
  assert.match(lyricExports.draftLyrics('Add heavy rain').join(' '),/rain/);
  assert.match(lyricExports.draftLyrics('neon city').join(' '),/city/);
});
test('provider lyric output must contain exactly two bounded lines',()=>{
  assert.equal(lyricExports.lyricLines(['Blue water','Wild hearts']).length,2);
  for(const value of [[],['one'],['one','two','three'],[{},'x'],['x'.repeat(100),'y']])assert.throws(()=>lyricExports.lyricLines(value));
});
const planSource=fs.readFileSync(new URL('../app/create/music-video/_lib/refinement-plan.ts',import.meta.url),'utf8');
const planJS=ts.transpileModule(planSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const planExports={};vm.runInNewContext(planJS,{exports:planExports});
test('Blender plans clamp effects and reject nonfinite model parameters',()=>{
 const plan=planExports.refinementPlan({zoom:999,glow:-5,bpm:Infinity,pulse:100,saturation:NaN,python:'arbitrary code'},60);
 assert.equal(plan.zoom,1.08);assert.equal(plan.glow,0);assert.equal(plan.bpm,104);assert.equal(plan.pulse,.025);assert.equal(plan.saturation,1.12);assert.equal(plan.python,undefined);
});
test('Blender captions cannot overlap or exceed the recorded duration',()=>{
 const plan=planExports.refinementPlan({captions:[{start:-1,end:5,text:'First\nline'},{start:2,end:99,text:'Second'},{start:NaN,end:4,text:'Invalid'}]},10);
 assert.equal(plan.captions.length,2);assert.equal(plan.captions[0].start,0);assert.equal(plan.captions[0].text,'First line');assert.equal(plan.captions[1].start,5);assert.equal(plan.captions[1].end,10);
});
