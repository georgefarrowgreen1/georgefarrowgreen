import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IFL,roofSkip} from './fixtures/roof.mjs';

let parseContacts;
if(IFL){
 const source=readFileSync(new URL('today/public/organise/import.js',IFL),'utf8').replace("from '/roof/system-client.js'",'from '+JSON.stringify(new URL('today/public/roof/system-client.js',IFL).href));
 ({parseContacts}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
}
const card=(lines='FN:Example Person',version='4.0')=>`BEGIN:VCARD\r\nVERSION:${version}\r\n${lines}\r\nEND:VCARD`;

test('vCard 3 and 4 preserve Unicode, escaped notes, folded names and contact fields',{skip:roofSkip},()=>{
 const rows=parseContacts(card('FN:Zoë \\; Chén\r\nEMAIL;TYPE=work:zoe@example.test\r\nEMAIL:second@example.test\r\nTEL;VALUE=uri:tel:+44 7700 900123\r\nORG:Studio;Research\r\nNOTE:First line\\nSecond\\, line')+'\r\n'+card('N:Family;Given;;;\r\nFN:A long\r\n folded name','3.0'));
 assert.deepEqual(rows,[{title:'Zoë ; Chén',email:'zoe@example.test',phone:'+44 7700 900123',organisation:'Studio · Research',details:'First line\nSecond, line',links:[]},{title:'A longfolded name',email:'',phone:'',organisation:'',details:'',links:[]}]);
});
test('vCard URLs, photos and unknown commands never become links or executable fields',{skip:roofSkip},()=>{
 const [row]=parseContacts(card('FN:<script>alert(1)</script>\r\nURL:javascript:alert(1)\r\nPHOTO;VALUE=uri:https://attacker.example/photo\r\nPHOTO;ENCODING=b;TYPE=JPEG:AAECAwQF\r\nX-COMMAND:DELETE ALL\r\nEMAIL:invalid@\r\nEMAIL:valid@example.test'));
 assert.deepEqual(row,{title:'<script>alert(1)</script>',email:'valid@example.test',phone:'',organisation:'',details:'',links:[]});
});
test('vCard import bounds reject oversized, over-count, encoded and control-character input',{skip:roofSkip},()=>{
 assert.equal(parseContacts(Array.from({length:100},()=>card()).join('\n')).length,100);
 assert.throws(()=>parseContacts(Array.from({length:101},()=>card()).join('\n')),/100 contacts/);
 assert.throws(()=>parseContacts('A'.repeat(512*1024+1)),/512 KB/);
 assert.throws(()=>parseContacts(card('FN;ENCODING=QUOTED-PRINTABLE:Encoded')),/UTF-8/);
 assert.throws(()=>parseContacts(card('FN:Name\u202eSpoof')),/unsupported characters/);
 assert.throws(()=>parseContacts(card('EMAIL:orphan@example.test')),/No named contacts/);
 assert.throws(()=>parseContacts(null),/512 KB/);
});
