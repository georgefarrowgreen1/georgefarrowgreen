import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {profileFingerprint,engineMatches} from '../src/engine-version.js';
test('release checks reject healthy old engines with stale profile data',async()=>{
 const profile=readFileSync(new URL('../profiles/road.brf',import.meta.url),'utf8'),hash=await profileFingerprint(profile),date='2026-11-07';
 assert.equal(hash,createHash('sha256').update(profile).digest('hex').slice(0,12));
 assert.equal(engineMatches({ready:true,snapshot:date+'-graph'},date,hash),false);
 assert.equal(engineMatches({ready:true,snapshot:date+'-graph-oldprofile'},date,hash),false);
 assert.equal(engineMatches({ready:true,snapshot:'2026-11-06-graph-'+hash},date,hash),false);
 assert.equal(engineMatches({ready:false,snapshot:date+'-graph-'+hash},date,hash),false);
 assert.equal(engineMatches({ready:true,snapshot:date+'-graph-'+hash},date,hash),true);
});
