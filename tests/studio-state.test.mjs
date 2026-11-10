import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const document=JSON.parse(readFileSync(new URL('../content.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('../studio.js',import.meta.url),'utf8');
function fixture(){
  const context={window:{},document:{readyState:'loading',addEventListener(){},getElementById(){return {hidden:false};}},URL,TextEncoder,setTimeout,clearTimeout,console};
  const anchor='window.YousifStudio = Object.freeze({';
  assert.ok(source.includes(anchor));
  const instrumented=source.replace(anchor,`window.__testStudio = {state,adoptBaseline,loadSource,reports:[]};
    render=()=>{};persist=()=>{};updateButtons=()=>{};
    report=messages=>window.__testStudio.reports.push(messages);
    ${anchor}`);
  runInNewContext(instrumented,context);
  return context.window.__testStudio;
}
const clone=value=>JSON.parse(JSON.stringify(value));
const shaA='a'.repeat(40),shaB='b'.repeat(40);
const next=()=>{const value=clone(document);value.profile.summary+=' Updated online.';value.futureField={retained:true};return value;};
test('a restored dirty draft keeps its original base through a changed static document and authenticated load',()=>{
  const api=fixture();const draft=clone(document);draft.profile.role='Draft role';
  api.state.cached={document:draft,baseline:clone(document),sha:shaA};
  api.adoptBaseline({document:next(),sha:null});
  assert.equal(api.state.conflict,true);assert.equal(api.state.document.profile.role,'Draft role');
  assert.equal(api.state.baseline.profile.summary,document.profile.summary);assert.equal(api.state.revision,shaA);
  api.adoptBaseline({document:next(),sha:shaB});
  assert.equal(api.state.conflict,true);assert.equal(api.state.revision,shaA);
  assert.equal(api.state.baseline.futureField,undefined);
});
test('a clean restored draft adopts new content without creating a false conflict',()=>{
  const api=fixture();api.state.cached={document:clone(document),baseline:clone(document),sha:shaA};
  api.adoptBaseline({document:next(),sha:null});
  assert.equal(api.state.conflict,false);assert.equal(api.state.document.futureField.retained,true);assert.equal(api.state.revision,null);
  api.adoptBaseline({document:next(),sha:shaB});assert.equal(api.state.revision,shaB);assert.equal(api.state.dirty,false);
});
test('a compatible dirty draft receives its verified revision without losing edits',()=>{
  const api=fixture();const draft=clone(document);draft.profile.role='Draft role';
  api.state.cached={document:draft,baseline:clone(document),sha:null};
  api.adoptBaseline({document:clone(document),sha:shaA});
  assert.equal(api.state.conflict,false);assert.equal(api.state.dirty,true);assert.equal(api.state.revision,shaA);assert.equal(api.state.document.profile.role,'Draft role');
});
test('explicit reload cannot erase edits made while the request is in flight',async()=>{
  const api=fixture();api.state.document=clone(document);api.state.baseline=clone(document);api.state.revision=shaA;
  let complete;const loading=api.loadSource(()=>new Promise(resolve=>{complete=resolve;}),true);
  api.state.document.profile.role='Typed during reload';complete({document:next(),sha:shaB});
  assert.equal(await loading,false);assert.equal(api.state.document.profile.role,'Typed during reload');assert.equal(api.state.revision,shaA);assert.equal(api.state.conflict,true);
  assert.ok(api.reports.flat().some(value=>value.includes('Those edits were kept')));
});
test('an explicit reload with no intervening edit replaces the draft and preserves new server fields',async()=>{
  const api=fixture();api.state.document=clone(document);api.state.baseline=clone(document);api.state.revision=shaA;
  assert.equal(await api.loadSource(async()=>({document:next(),sha:shaB}),true),true);
  assert.equal(api.state.revision,shaB);assert.equal(api.state.conflict,false);assert.equal(api.state.document.futureField.retained,true);
});
