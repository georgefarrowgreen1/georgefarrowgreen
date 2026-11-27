import {test} from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MAIL, legacyMailContract, mailWorkerSkip } from './fixtures/mail.mjs';
test('Mail push keeps delivery on its validated endpoint and leaves provider bodies out of logs',{skip:mailWorkerSkip},async()=>{
 const { pushAll, pushMailNotice }=await import(new URL('src/push.js',MAIL));
 const sql=new DatabaseSync(':memory:'); sql.exec('CREATE TABLE meta (k TEXT PRIMARY KEY,v TEXT); CREATE TABLE push_subs(endpoint TEXT,p256dh TEXT,auth TEXT); CREATE TABLE push_notices(id TEXT PRIMARY KEY,thread_id TEXT,kind TEXT,expires_at INTEGER)');
 const stmt=(q,args=[])=>({bind:(...a)=>stmt(q,a),first:async()=>sql.prepare(q).get(...args),all:async()=>({results:sql.prepare(q).all(...args)}),run:async()=>sql.prepare(q).run(...args)});
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const pub=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url');
 sql.prepare('INSERT INTO push_subs VALUES(?,?,?)').run('https://fcm.googleapis.com/fcm/send/sample',pub,Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'));
 const requests=[],logs=[],old=globalThis.fetch,logger=console.error;
 globalThis.fetch=async(url,init)=>{requests.push({url,init});return new Response('PRIVATE PROVIDER BODY',{status:307,headers:{Location:'https://untrusted.example/collect'}})};
 console.error=(...a)=>logs.push(a.join(' '));
 try {
  const env = { DB: { prepare: stmt } };
  const delivered = legacyMailContract
    ? await pushAll(env, { title: 'Notice', body: 'Private text' })
    : await pushMailNotice(env, { kind: 'new', threadId: 'private-thread' });
  assert.equal(delivered, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://fcm.googleapis.com/fcm/send/sample');
  assert.equal(requests[0].init.redirect, 'manual');
  assert.ok(!logs.join(' ').includes('PRIVATE PROVIDER BODY'));
  if (!legacyMailContract) {
    const record = sql.prepare('SELECT id, thread_id, expires_at FROM push_notices').get();
    assert.match(record.id, /^[a-f0-9-]{36}$/);
    assert.notEqual(record.id, record.thread_id);
    assert.equal(record.thread_id, 'private-thread');
    assert.ok(record.expires_at > Date.now());
  }
 }
 finally{globalThis.fetch=old;console.error=logger;sql.close()}
});
