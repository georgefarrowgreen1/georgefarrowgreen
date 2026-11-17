// The head script must observe the transition that can reject before modules
// load. Run actual rejecting promises in a child process so regressions expose
// unhandled rejections without weakening the test runner's own error handling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
const source = readFileSync(new URL('../../../account/theme.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../../account/app.js', import.meta.url), 'utf8');

test('early identity head observes active, swap and reveal cancellation promises without suppressing unrelated errors', () => {
  const child = String.raw`
    const vm = require('node:vm'), events = new Map(), unhandled = [];
    process.on('unhandledRejection', reason => unhandled.push(reason.message));
    const transition = () => {
      const rejects = [], t = {};
      for (const key of ['ready','finished','updateCallbackDone']) t[key] = new Promise((_, reject) => rejects.push(reject));
      return { t, cancel() { for (const reject of rejects) reject(new DOMException('Transition was aborted because of invalid state. ViewTransition opt-in disabled','InvalidStateError')); } };
    };
    const active = transition(), swap = transition(), reveal = transition();
    const context = { document: {activeViewTransition: active.t}, __iflMotionReady: true, __iflZoomBlocked: true,
      addEventListener(type, run) { const list = events.get(type) || []; list.push(run); events.set(type,list); } };
    vm.runInNewContext(SOURCE, context);
    active.cancel();
    for (const [type, item] of [['pageswap',swap],['pagereveal',reveal]]) {
      for (const run of events.get(type) || []) run({viewTransition:item.t});
      item.cancel();
    }
    Promise.reject(new Error('genuine account failure'));
    setImmediate(() => { process.stdout.write(JSON.stringify({unhandled,events:[...events.keys()]})); });
  `.replace('SOURCE', JSON.stringify(source));
  const answer = JSON.parse(execFileSync(process.execPath, ['-e', child], { encoding: 'utf8' }));
  assert.deepEqual(answer.unhandled, ['genuine account failure']);
  assert.deepEqual(answer.events, ['pageswap', 'pagereveal']);
});

test('same-document helper observes update completion while returning the original promise to callers', async () => {
  const helper = /function viewTransition\(fn\) \{[\s\S]*?\n\}/.exec(app)?.[0];
  assert.ok(helper);
  const failure = new Error('render failed');
  const transition = {ready:Promise.resolve(),finished:Promise.resolve(),updateCallbackDone:Promise.reject(failure)};
  const context = { document:{startViewTransition:()=>transition} };
  const returned = vm.runInNewContext(helper + '\nviewTransition(()=>{})', context);
  assert.equal(returned,transition);
  await assert.rejects(returned.updateCallbackDone,error=>error===failure,'callers can still report their real render failure');
});

test('the identity head guard runs before boot and deferred application modules', () => {
  const html = readFileSync(new URL('../../../account/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('src="theme.js"') < html.indexOf('src="boot.js"'));
  assert.ok(html.indexOf('src="theme.js"') < html.indexOf('type="module"'));
  assert.doesNotMatch(source.slice(0, source.indexOf("// ==== InFlite motion")), /unhandledrejection|preventDefault|skipTransition/);
});

test('auth method transition still reports a genuine callback failure and releases its presentation state', async () => {
  const gate = /function gate\(to\) \{[\s\S]*?\n\}/.exec(app)?.[0];
  assert.ok(gate);
  const failure = new Error('real auth render failure'), reported = [], classes = new Set();
  const transition = { updateCallbackDone:Promise.reject(failure), finished:Promise.resolve() };
  const context = { AUTH:null, still:{matches:false}, document:{startViewTransition(){},hidden:false},
    main:{classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}}, viewTransition:()=>transition,
    reportError:error=>reported.push(error) };
  vm.runInNewContext('let gating=0, gateRevision=0;\n' + gate + '\ngate("forgot")', context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(reported,[failure]);
  assert.equal(classes.has('vt-gate'),false);
});


test('only the latest auth navigation can move focus after transition completion', async () => {
  const gate = /function gate\(to\) \{[\s\S]*?\n\}/.exec(app)[0];
  const callbacks = [], fields = [], focused = [], classes = new Set();
  const context = { AUTH:null, S:{}, still:{matches:false}, document:{startViewTransition(){},hidden:false},
    main:{classList:{add:n=>classes.add(n),remove:n=>classes.delete(n)},querySelectorAll:()=>fields},
    $:()=>null,render(){fields.splice(0,fields.length,{getClientRects:()=>[{}],focus:()=>focused.push(context.S.gate)})},
    viewTransition(fn){fn();let resolve;const promise=new Promise(r=>resolve=r);callbacks.push(resolve);return{updateCallbackDone:promise,finished:promise}} };
  vm.runInNewContext('let gating=0, gateRevision=0;\n'+gate+'\ngate("forgot");gate("signin");',context);
  callbacks[0]();await new Promise(r=>setImmediate(r));
  assert.deepEqual(focused,[],'an obsolete transition must not summon a keyboard or steal focus');
  callbacks[1]();await new Promise(r=>setImmediate(r));
  assert.deepEqual(focused,['signin']);assert.equal(classes.size,0);
});
