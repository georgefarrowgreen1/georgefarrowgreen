import{test}from'node:test';import assert from'node:assert/strict';import{frameworkRevision}from'../../security/framework-fixture.mjs';
test('release fixture rejects branch names, shell text and unbounded metadata before running Git',()=>{for(const commit of ['main','HEAD','--upload-pack=anything','a'.repeat(40)+'; env',null,{}])assert.throws(()=>frameworkRevision({commit,build:'4.11'}));for(const build of ['',4.11,'4.1','../../file'])assert.throws(()=>frameworkRevision({commit:'a'.repeat(40),build}));assert.throws(()=>frameworkRevision({commit:'a'.repeat(40),build:'4.11',repository:'another/repo'}));assert.deepEqual(frameworkRevision({commit:'a'.repeat(40),build:'4.11'}),{commit:'a'.repeat(40),build:'4.11'})});

test('release fixtures accept the three-part ecosystem build format', () => {
  const commit = 'a'.repeat(40);
  assert.deepEqual(frameworkRevision({ commit, build: '4.7.1' }), { commit, build: '4.7.1' });
  for (const build of ['04.7.1', '4.07.1', '4.7.01', '4.7.1.0', '4.7.x']) {
    assert.throws(() => frameworkRevision({ commit, build }));
  }
});
