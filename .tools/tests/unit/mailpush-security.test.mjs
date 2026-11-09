import {test} from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { IFL, mailSkip } from './fixtures/roof.mjs';
test('Mail push keeps delivery on its validated endpoint and leaves provider bodies out of logs',{skip:mailSkip},async()=>{
 const { pushAll }=await import(new URL('email/src/push.js',IFL));
 const sql=new DatabaseSync(':memory:'); sql.exec('CREATE TABLE meta (k TEXT PRIMARY KEY,v TEXT); CREATE TABLE push_subs(endpoint TEXT,p256dh TEXT,auth TEXT)');
 const stmt=(q,args=[])=>({bind:(...a)=>stmt(q,a),first:async()=>sql.prepare(q).get(...args),all:async()=>({results:sql.prepare(q).all(...args)}),run:async()=>sql.prepare(q).run(...args)});
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const pub=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64url');
 sql.prepare('INSERT INTO push_subs VALUES(?,?,?)').run('https://fcm.googleapis.com/fcm/send/sample',pub,Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'));
 const requests=[],logs=[],old=globalThis.fetch,logger=console.error;
 globalThis.fetch=async(url,init)=>{requests.push({url,init});return new Response('PRIVATE PROVIDER BODY',{status:307,headers:{Location:'https://untrusted.example/collect'}})};
 console.error=(...a)=>logs.push(a.join(' '));
 try {assert.equal(await pushAll({DB:{prepare:stmt}},{title:'Notice',body:'Private text'}),0);assert.equal(requests.length,1);assert.equal(requests[0].init.redirect,'manual');assert.ok(!logs.join(' ').includes('PRIVATE PROVIDER BODY'));}
 finally{globalThis.fetch=old;console.error=logger;sql.close()}
});
